import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  LIMITE_DO_HISTORICO_DE_COTACOES,
  desempenhoDoFornecedorSchema,
  fornecedorSchema,
  historicoDeCotacoesRespostaSchema,
  type DesempenhoDoFornecedor,
  type HistoricoDeCotacoesResposta,
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
  calcularDesempenho,
  camposInformados,
  venceu,
  filtroDaBusca,
  filtroDaSituacao,
  paraFornecedor,
  paraItemDaLista,
} from "./fornecedores.rules";

/**
 * Teto da lista: o cadastro é pequeno (dezenas), e a tela filtra por busca.
 * A contagem não tem teto, então passar de 500 aparece como contagem maior que
 * os itens; se o cadastro crescer, a lista ganha paginação.
 */
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
    // Edição sem campo nenhum não grava, não muda a autoria nem gera evento.
    if (camposInformados(input).length === 0) return this.obter(id);
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

  /**
   * Idempotente: inativar quem já está inativo não grava nada nem gera evento.
   * A troca é condicional à situação oposta, então duas requisições simultâneas
   * geram um evento só.
   */
  async mudarSituacao(id: string, ativo: boolean, principal: AuthPrincipal): Promise<Fornecedor> {
    await this.garantirExistente(id);
    await this.prisma.comContexto(async (tx) => {
      const { count } = await tx.fornecedor.updateMany({ where: { id, ativo: !ativo }, data: { ativo, atualizadoPorId: principal.id } });
      if (count === 1) {
        await this.registrar(tx, ativo ? "suprimentos.fornecedor.reactivated" : "suprimentos.fornecedor.inactivated", id, principal, {});
      }
    });
    return this.obter(id);
  }

  async desempenho(id: string): Promise<DesempenhoDoFornecedor> {
    await this.garantirExistente(id);
    const cotacoes = await this.prisma.comContexto((tx) => tx.cotacaoDeCompra.findMany({
      where: { fornecedorId: id },
      select: { id: true, valor: true, valorFrete: true, prazoEntregaDias: true, createdAt: true, pedido: { select: { cotacaoSelecionadaId: true, canceladoEm: true, etapa: true } } },
    }));
    return desempenhoDoFornecedorSchema.parse(calcularDesempenho(cotacoes.map((c) => ({
      valor: c.valor,
      valorFrete: c.valorFrete,
      prazoEntregaDias: c.prazoEntregaDias,
      createdAt: c.createdAt,
      escolhida: c.pedido.cotacaoSelecionadaId === c.id,
      pedidoCancelado: c.pedido.canceladoEm !== null,
      pedidoConcluido: c.pedido.etapa === "concluido",
    }))));
  }

  async historicoDeCotacoes(id: string): Promise<HistoricoDeCotacoesResposta> {
    await this.garantirExistente(id);
    const [linhas, total] = await this.prisma.comContexto((tx) => Promise.all([
      tx.cotacaoDeCompra.findMany({
        where: { fornecedorId: id },
        orderBy: { createdAt: "desc" },
        take: LIMITE_DO_HISTORICO_DE_COTACOES,
        select: {
          id: true, valor: true, valorFrete: true, prazoEntregaDias: true, createdAt: true,
          pedido: { select: { id: true, numero: true, titulo: true, companyId: true, etapa: true, canceladoEm: true, cotacaoSelecionadaId: true } },
        },
      }),
      tx.cotacaoDeCompra.count({ where: { fornecedorId: id } }),
    ]));
    return historicoDeCotacoesRespostaSchema.parse({
      itens: linhas.map((c) => ({
        id: c.id,
        pedido: { id: c.pedido.id, numero: c.pedido.numero, titulo: c.pedido.titulo, empresa: c.pedido.companyId, situacao: c.pedido.canceladoEm ? "cancelado" : c.pedido.etapa },
        data: c.createdAt.toISOString(),
        valorTotal: c.valor.add(c.valorFrete ?? 0).toFixed(2),
        prazoEntregaDias: c.prazoEntregaDias,
        venceu: venceu({ escolhida: c.pedido.cotacaoSelecionadaId === c.id, pedidoCancelado: c.pedido.canceladoEm !== null }),
      })),
      total,
    });
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
