import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { BloqueioDaConexaoOmie, CompanyKey, EmpresaDoOmie, NomeDeEventoDoCatalogo } from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { AcessoNegado, Conflito } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

const PESSOA = { select: { id: true, name: true } } as const;
const INCLUDE = { ultimoTestePor: PESSOA, confirmadaPor: PESSOA } satisfies Prisma.OmieConexaoInclude;
export type LinhaDaConexao = Prisma.OmieConexaoGetPayload<{ include: typeof INCLUDE }>;

/**
 * A conferência dos pares do OMIE (PLU-342) e o CNPJ das empresas. O par em si
 * fica no cofre (`SegredoRepository`); aqui só o que não é segredo, com os
 * eventos na mesma transação.
 */
@Injectable()
export class PrismaOmieConexoesRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {}

  async linhas(): Promise<Map<CompanyKey, LinhaDaConexao>> {
    const linhas = await this.prisma.comContexto((tx) => tx.omieConexao.findMany({ include: INCLUDE }));
    return new Map(linhas.map((l) => [l.companyId as CompanyKey, l]));
  }

  async cnpjsDoCadastro(): Promise<Map<CompanyKey, string | null>> {
    const empresas = await this.prisma.comContexto((tx) => tx.company.findMany({ select: { id: true, cnpj: true } }));
    return new Map(empresas.map((e) => [e.id as CompanyKey, e.cnpj]));
  }

  /** Pela função do banco: só a plataforma grava, e o banco confere de novo. */
  async definirCnpj(empresa: CompanyKey, cnpj: string | null, principal: AuthPrincipal): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      try {
        await tx.$executeRaw`SELECT plugga_security.definir_cnpj_da_empresa(${empresa}, ${cnpj})`;
      } catch (erro) {
        if (erro instanceof Prisma.PrismaClientKnownRequestError && /insufficient_privilege|42501/.test(erro.message)) {
          throw new AcessoNegado("Só Admin e Desenvolvedor definem o CNPJ da empresa.");
        }
        if (erro instanceof Prisma.PrismaClientKnownRequestError && /companies_cnpj_key|23505/.test(erro.message)) {
          throw new Conflito("Este CNPJ já é o da outra empresa.", [{ campo: "cnpj", problema: "Este CNPJ já é o da outra empresa." }]);
        }
        throw erro;
      }
      await this.registrar(tx, "organizacao.empresa.cnpj_definido", empresa, principal, { definido: cnpj !== null });
    });
  }

  /** Par novo gravado: o teste e a confirmação do par anterior deixam de valer. */
  async reiniciar(empresa: CompanyKey, segredoAtualizadoEm: Date, principal: AuthPrincipal, troca: boolean): Promise<void> {
    const vazio = { segredoAtualizadoEm, ultimoTesteEm: null, ultimoTestePorId: null, ultimoTeste: Prisma.DbNull, bloqueio: null, confirmadaEm: null, confirmadaPorId: null, cnpjConfirmado: null, razaoSocialConfirmada: null };
    await this.prisma.comContexto(async (tx) => {
      await tx.omieConexao.upsert({ where: { companyId: empresa }, create: { companyId: empresa, ...vazio }, update: vazio });
      await this.registrar(tx, "integracoes.omie.conectada", empresa, principal, { troca });
    });
  }

  async registrarTeste(
    empresa: CompanyKey,
    segredoAtualizadoEm: Date,
    empresas: EmpresaDoOmie[],
    resultado: { bloqueio: BloqueioDaConexaoOmie | null; confirmar: { cnpj: string; razaoSocial: string | null } | null },
    principal: AuthPrincipal,
    agora: Date,
  ): Promise<void> {
    const dados = {
      segredoAtualizadoEm,
      ultimoTesteEm: agora,
      ultimoTestePorId: principal.id,
      ultimoTeste: empresas as unknown as Prisma.InputJsonValue,
      bloqueio: resultado.bloqueio,
      confirmadaEm: resultado.confirmar ? agora : null,
      confirmadaPorId: resultado.confirmar ? principal.id : null,
      cnpjConfirmado: resultado.confirmar?.cnpj ?? null,
      razaoSocialConfirmada: resultado.confirmar?.razaoSocial ?? null,
    };
    await this.prisma.comContexto(async (tx) => {
      await tx.omieConexao.upsert({ where: { companyId: empresa }, create: { companyId: empresa, ...dados }, update: dados });
      await this.registrar(tx, "integracoes.omie.testada", empresa, principal, {
        resultado: resultado.bloqueio ?? (resultado.confirmar ? "conectada" : "a_confirmar"),
        empresas: empresas.length,
      });
      if (resultado.confirmar) await this.registrar(tx, "integracoes.omie.confirmada", empresa, principal, { automatica: true });
    });
  }

  async confirmar(empresa: CompanyKey, cnpj: string, razaoSocial: string | null, principal: AuthPrincipal, agora: Date): Promise<void> {
    await this.prisma.comContexto(async (tx) => {
      await tx.omieConexao.update({
        where: { companyId: empresa },
        data: { confirmadaEm: agora, confirmadaPorId: principal.id, cnpjConfirmado: cnpj, razaoSocialConfirmada: razaoSocial },
      });
      await this.registrar(tx, "integracoes.omie.confirmada", empresa, principal, { automatica: false });
    });
  }

  async registrarDesconexao(empresa: CompanyKey, principal: AuthPrincipal): Promise<void> {
    await this.prisma.comContexto((tx) => this.registrar(tx, "integracoes.omie.desconectada", empresa, principal, {}));
  }

  async registrarContaAntigaMovida(principal: AuthPrincipal, apagada: boolean): Promise<void> {
    await this.prisma.comContexto((tx) => this.registrar(tx, "integracoes.omie.conta_antiga_movida", "plugga", principal, { apagada }));
  }

  private registrar(tx: Prisma.TransactionClient, eventName: NomeDeEventoDoCatalogo, empresa: CompanyKey, principal: AuthPrincipal, payload: Record<string, unknown>): Promise<void> {
    return this.auditoria.append(tx, {
      eventName,
      entityType: "integracao_omie",
      entityId: empresa,
      companyId: empresa,
      actorType: principal.kind === "user" ? "user" : "agent",
      actorId: principal.id,
      payload,
      occurredAt: new Date(),
    });
  }
}
