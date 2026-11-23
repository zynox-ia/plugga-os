import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  fornecedorSchema,
  listarFornecedoresQuerySchema,
  listarFornecedoresRespostaSchema,
  type CriarFornecedor,
  type EditarFornecedor,
  type Fornecedor,
  type ListarFornecedoresQuery,
  type ListarFornecedoresResposta,
  type NomeDeEventoDoCatalogo,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { Conflito, NaoEncontrado } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { FornecedoresRepository } from "./fornecedores.repository";
import {
  INCLUDE_DO_FORNECEDOR,
  camposInformados,
  filtroDaBusca,
  filtroDaSituacao,
  paraFornecedor,
  paraItemDaLista,
} from "./fornecedores.rules";

/** Teto da lista: o cadastro é pequeno (dezenas), e a tela filtra por busca. */
const LIMITE_DA_LISTA = 500;

const DOCUMENTO_REPETIDO = [{ campo: "documento", problema: "Já existe um fornecedor com este documento." }];

@Injectable()
export class PrismaFornecedoresRepository extends FornecedoresRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {
    super();
  }

  async listar(entrada: ListarFornecedoresQuery): Promise<ListarFornecedoresResposta> {
    const query = listarFornecedoresQuerySchema.parse(entrada);
    const base: Prisma.FornecedorWhereInput = {
      ...filtroDaBusca(query.busca),
      ...(query.categoria ? { categoria: query.categoria } : {}),
    };
    const [linhas, porSituacao] = await this.prisma.comContexto((tx) => Promise.all([
      tx.fornecedor.findMany({
        where: { ...base, ...filtroDaSituacao(query.situacao) },
        include: INCLUDE_DO_FORNECEDOR,
        orderBy: [{ ativo: "desc" }, { nome: "asc" }],
        take: LIMITE_DA_LISTA,
      }),
      tx.fornecedor.groupBy({ by: ["ativo"], where: base, _count: { _all: true } }),
    ]));
    const contar = (ativo: boolean) => porSituacao.find((grupo) => grupo.ativo === ativo)?._count._all ?? 0;
    return listarFornecedoresRespostaSchema.parse({
      itens: linhas.map(paraItemDaLista),
      contagem: { ativos: contar(true), inativos: contar(false) },
    });
  }

  async obter(id: string): Promise<Fornecedor> {
    const linha = await this.prisma.comContexto((tx) => tx.fornecedor.findUnique({ where: { id }, include: INCLUDE_DO_FORNECEDOR }));
    if (!linha) throw new NaoEncontrado("Fornecedor não encontrado.");
    return fornecedorSchema.parse(paraFornecedor(linha));
  }

  async criar(input: CriarFornecedor, principal: AuthPrincipal): Promise<Fornecedor> {
    if (input.documento) await this.garantirDocumentoLivre(input.documento);
    const criado = await this.comDocumentoUnico(() => this.prisma.comContexto(async (tx) => {
      const linha = await tx.fornecedor.create({
        data: { ...input, criadoPorId: principal.id, atualizadoPorId: principal.id },
        include: INCLUDE_DO_FORNECEDOR,
      });
      await this.registrar(tx, "suprimentos.fornecedor.created", linha.id, principal, { campos: camposInformados(input) });
      return linha;
    }));
    return fornecedorSchema.parse(paraFornecedor(criado));
  }

  async editar(id: string, input: EditarFornecedor, principal: AuthPrincipal): Promise<Fornecedor> {
    await this.garantirExistente(id);
    if (input.documento) await this.garantirDocumentoLivre(input.documento, id);
    const editado = await this.comDocumentoUnico(() => this.prisma.comContexto(async (tx) => {
      const linha = await tx.fornecedor.update({
        where: { id },
        data: { ...input, atualizadoPorId: principal.id },
        include: INCLUDE_DO_FORNECEDOR,
      });
      await this.registrar(tx, "suprimentos.fornecedor.updated", id, principal, { campos: camposInformados(input) });
      return linha;
    }));
    return fornecedorSchema.parse(paraFornecedor(editado));
  }

  /** Idempotente: inativar quem já está inativo não grava nada nem gera evento. */
  async mudarSituacao(id: string, ativo: boolean, principal: AuthPrincipal): Promise<Fornecedor> {
    const atual = await this.garantirExistente(id);
    if (atual.ativo !== ativo) {
      await this.prisma.comContexto(async (tx) => {
        await tx.fornecedor.update({ where: { id }, data: { ativo, atualizadoPorId: principal.id } });
        await this.registrar(tx, ativo ? "suprimentos.fornecedor.reactivated" : "suprimentos.fornecedor.inactivated", id, principal, {});
      });
    }
    return this.obter(id);
  }

  private async garantirExistente(id: string): Promise<{ ativo: boolean }> {
    const linha = await this.prisma.comContexto((tx) => tx.fornecedor.findUnique({ where: { id }, select: { ativo: true } }));
    if (!linha) throw new NaoEncontrado("Fornecedor não encontrado.");
    return linha;
  }

  /** Confere antes para dar a mensagem certa; o índice único garante na corrida. */
  private async garantirDocumentoLivre(documento: string, excetoId?: string): Promise<void> {
    const outro = await this.prisma.comContexto((tx) => tx.fornecedor.findFirst({
      where: { documento, ...(excetoId ? { NOT: { id: excetoId } } : {}) },
      select: { id: true },
    }));
    if (outro) throw new Conflito("Já existe um fornecedor com este documento.", DOCUMENTO_REPETIDO);
  }

  private async comDocumentoUnico<T>(gravar: () => Promise<T>): Promise<T> {
    try {
      return await gravar();
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        throw new Conflito("Já existe um fornecedor com este documento.", DOCUMENTO_REPETIDO);
      }
      throw erro;
    }
  }

  private registrar(
    tx: Prisma.TransactionClient,
    eventName: NomeDeEventoDoCatalogo,
    entityId: string,
    principal: AuthPrincipal,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.append(tx, {
      eventName,
      entityType: "fornecedor",
      entityId,
      actorType: principal.kind === "user" ? "user" : "agent",
      actorId: principal.id,
      payload,
      occurredAt: new Date(),
    });
  }
}
