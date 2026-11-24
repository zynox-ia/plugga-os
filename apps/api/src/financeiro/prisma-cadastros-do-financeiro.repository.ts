import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  CategoriaFinanceira,
  CompanyKey,
  ContaCorrente,
  CriarCategoriaFinanceira,
  CriarContaCorrente,
  EditarCategoriaFinanceira,
  EditarContaCorrente,
  NomeDeEventoDoCatalogo,
} from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { Conflito, NaoEncontrado } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

type LinhaDaCategoria = Prisma.CategoriaFinanceiraGetPayload<object>;
type LinhaDaConta = Prisma.ContaCorrenteGetPayload<object>;

export const paraCategoria = (c: LinhaDaCategoria): CategoriaFinanceira => ({
  id: c.id,
  empresa: c.companyId as CompanyKey,
  codigo: c.codigo,
  nome: c.nome,
  tipo: c.tipo,
  natureza: c.natureza,
  grupo: { codigo: c.codigo.split(".").slice(0, 2).join("."), nome: c.grupoNome },
  ativa: c.ativa,
});

export const paraConta = (c: LinhaDaConta): ContaCorrente => ({
  id: c.id,
  empresa: c.companyId as CompanyKey,
  nome: c.nome,
  banco: c.banco,
  agencia: c.agencia,
  numero: c.numero,
  saldo: c.saldo?.toFixed(2) ?? null,
  saldoLidoEm: c.saldoLidoEm?.toISOString() ?? null,
  ativa: c.ativa,
});

/** Os campos que mudaram, para o evento: nomes, nunca valores. */
const camposAlterados = <T extends object>(antes: T, depois: Partial<T>): string[] =>
  (Object.keys(depois) as (keyof T)[]).filter((k) => depois[k] !== undefined && depois[k] !== antes[k]).map(String);

/**
 * O plano de contas e as contas correntes do Plugga OS (PLU-342, S3b). Só a gerência do
 * Financeiro grava: o controller confere, e o RLS também (política de INSERT e UPDATE
 * com `tem_tela(..., true)`). Nada se apaga; desativar tira dos menus.
 */
@Injectable()
export class PrismaCadastrosDoFinanceiroRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {}

  async criarCategoria(input: CriarCategoriaFinanceira, principal: AuthPrincipal): Promise<CategoriaFinanceira> {
    try {
      return await this.prisma.comContexto(async (tx) => {
        const criada = await tx.categoriaFinanceira.create({
          data: { companyId: input.empresa, codigo: input.codigo, nome: input.nome, tipo: input.tipo, natureza: input.natureza, grupoNome: input.grupoNome },
        });
        await this.registrar(tx, "financeiro.categoria.created", "categoria_financeira", criada.id, criada.companyId, principal, { codigo: criada.codigo, tipo: criada.tipo });
        return paraCategoria(criada);
      });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        throw new Conflito(`Já existe a categoria ${input.codigo} nesta empresa.`, [{ campo: "codigo", problema: "Um código por empresa." }]);
      }
      throw erro;
    }
  }

  async editarCategoria(id: string, input: EditarCategoriaFinanceira, principal: AuthPrincipal): Promise<CategoriaFinanceira> {
    return this.prisma.comContexto(async (tx) => {
      const antes = await tx.categoriaFinanceira.findUnique({ where: { id } });
      if (!antes) throw new NaoEncontrado("Categoria não encontrada.");
      const campos = camposAlterados({ nome: antes.nome, natureza: antes.natureza, grupoNome: antes.grupoNome, ativa: antes.ativa }, input);
      if (campos.length === 0) return paraCategoria(antes);
      const depois = await tx.categoriaFinanceira.update({ where: { id }, data: input });
      await this.registrar(tx, "financeiro.categoria.updated", "categoria_financeira", id, depois.companyId, principal, { codigo: depois.codigo, campos });
      return paraCategoria(depois);
    });
  }

  async criarConta(input: CriarContaCorrente, principal: AuthPrincipal): Promise<ContaCorrente> {
    return this.prisma.comContexto(async (tx) => {
      const criada = await tx.contaCorrente.create({
        data: { companyId: input.empresa, nome: input.nome, banco: input.banco ?? null, agencia: input.agencia ?? null, numero: input.numero ?? null },
      });
      await this.registrar(tx, "financeiro.conta_corrente.created", "conta_corrente", criada.id, criada.companyId, principal, {});
      return paraConta(criada);
    });
  }

  async editarConta(id: string, input: EditarContaCorrente, principal: AuthPrincipal): Promise<ContaCorrente> {
    return this.prisma.comContexto(async (tx) => {
      const antes = await tx.contaCorrente.findUnique({ where: { id } });
      if (!antes) throw new NaoEncontrado("Conta corrente não encontrada.");
      const campos = camposAlterados({ nome: antes.nome, banco: antes.banco, agencia: antes.agencia, numero: antes.numero, ativa: antes.ativa }, input);
      if (campos.length === 0) return paraConta(antes);
      const depois = await tx.contaCorrente.update({ where: { id }, data: input });
      await this.registrar(tx, "financeiro.conta_corrente.updated", "conta_corrente", id, depois.companyId, principal, { campos });
      return paraConta(depois);
    });
  }

  private registrar(
    tx: Prisma.TransactionClient,
    eventName: NomeDeEventoDoCatalogo,
    entityType: string,
    entityId: string,
    companyId: string,
    principal: AuthPrincipal,
    payload: Record<string, unknown>,
  ): Promise<void> {
    return this.auditoria.append(tx, {
      eventName,
      entityType,
      entityId,
      companyId,
      actorType: principal.kind === "user" ? "user" : "agent",
      actorId: principal.id,
      payload,
      occurredAt: new Date(),
    });
  }
}
