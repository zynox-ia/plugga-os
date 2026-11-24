import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { CompanyKey } from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { conferirCategorias, conferirContas, type CategoriaDoPlugga, type ContaDoPlugga } from "./omie-cadastros.rules";
import type { CategoriaDoOmie, ContaCorrenteDoOmie } from "./omie.port";

export type LidosDoOmie = { categorias: readonly CategoriaDoOmie[]; contas: readonly ContaCorrenteDoOmie[] };
export type ContagemDaImportacao = { categorias: { criadas: number; vinculadas: number; paraClassificar: number }; contasCorrentes: { criadas: number; vinculadas: number } };

/**
 * "Importar do OMIE" e "Conferir com o OMIE" (S4, PLU-342): o cadastro do Plugga OS e os
 * vínculos do conector, lidos e gravados com a sessão de quem pediu (a gerência). A
 * importação só cria o que falta e insere vínculos: nunca muda um cadastro que já existe.
 */
@Injectable()
export class PrismaOmieImportacaoRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditAppender) private readonly auditoria: AuditAppender,
  ) {}

  /** A conferência: o que o OMIE leu contra o cadastro de agora. Só leitura. */
  async conferir(empresa: CompanyKey, lidos: LidosDoOmie) {
    return this.prisma.comContexto(async (tx) => {
      const { categorias, contas } = await this.cadastros(tx, empresa);
      return { categorias: conferirCategorias(lidos.categorias, categorias), contas: conferirContas(lidos.contas, contas) };
    });
  }

  /**
   * Cria o que falta e vincula o que casa, numa transação, com a empresa travada (duas
   * importações ao mesmo tempo não duplicam nada). A conferência é refeita aqui dentro,
   * contra o cadastro travado.
   */
  async importar(empresa: CompanyKey, lidos: LidosDoOmie, principal: AuthPrincipal, agora: Date): Promise<ContagemDaImportacao> {
    return this.prisma.comContexto(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`omie.importacao.${empresa}`}))`;
      const { categorias, contas } = await this.cadastros(tx, empresa);
      const doCategorias = conferirCategorias(lidos.categorias, categorias);
      const doContas = conferirContas(lidos.contas, contas);

      for (const nova of doCategorias.aCriar) {
        const criada = await tx.categoriaFinanceira.create({
          data: { companyId: empresa, codigo: nova.codigo, nome: nova.nome, tipo: nova.tipo, natureza: nova.natureza, grupoNome: nova.grupoNome, ativa: nova.ativa },
          select: { id: true },
        });
        await tx.omieCategoria.create({ data: { categoriaId: criada.id, companyId: empresa, omieCodigo: nova.codigo, lidaEm: agora } });
      }
      for (const v of doCategorias.aVincular) {
        await tx.omieCategoria.create({ data: { categoriaId: v.pluggaId, companyId: empresa, omieCodigo: v.omieCodigo, lidaEm: agora } });
      }
      for (const nova of doContas.aCriar) {
        const criada = await tx.contaCorrente.create({
          data: { companyId: empresa, nome: nova.nome, banco: nova.banco, agencia: nova.agencia, numero: nova.numero, ativa: nova.ativa },
          select: { id: true },
        });
        await tx.omieContaCorrente.create({ data: { contaCorrenteId: criada.id, companyId: empresa, omieCodigo: nova.omieCodigo, lidaEm: agora } });
      }
      for (const v of doContas.aVincular) {
        await tx.omieContaCorrente.create({ data: { contaCorrenteId: v.pluggaId, companyId: empresa, omieCodigo: v.omieCodigo, lidaEm: agora } });
      }

      const contagem: ContagemDaImportacao = {
        // Toda categoria criada entra com a natureza padrão: a gerência classifica depois.
        categorias: { criadas: doCategorias.aCriar.length, vinculadas: doCategorias.aVincular.length, paraClassificar: doCategorias.aCriar.length },
        contasCorrentes: { criadas: doContas.aCriar.length, vinculadas: doContas.aVincular.length },
      };
      // Só as contagens: nada do cadastro do OMIE vai ao evento.
      await this.auditoria.append(tx, {
        eventName: "integracoes.omie.importada",
        entityType: "integracao_omie",
        entityId: empresa,
        companyId: empresa,
        actorType: principal.kind === "user" ? "user" : "agent",
        actorId: principal.id,
        payload: contagem,
        occurredAt: agora,
      });
      return contagem;
    });
  }

  private async cadastros(tx: Prisma.TransactionClient, empresa: CompanyKey): Promise<{ categorias: CategoriaDoPlugga[]; contas: ContaDoPlugga[] }> {
    const [categorias, contas] = await Promise.all([
      tx.categoriaFinanceira.findMany({ where: { companyId: empresa }, include: { omie: { select: { omieCodigo: true } } }, orderBy: { codigo: "asc" } }),
      tx.contaCorrente.findMany({ where: { companyId: empresa }, include: { omie: { select: { omieCodigo: true } } }, orderBy: { nome: "asc" } }),
    ]);
    return {
      categorias: categorias.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome, tipo: c.tipo, ativa: c.ativa, grupoNome: c.grupoNome, omieCodigo: c.omie?.omieCodigo ?? null })),
      contas: contas.map((c) => ({ id: c.id, nome: c.nome, banco: c.banco, agencia: c.agencia, numero: c.numero, omieCodigo: c.omie?.omieCodigo ?? null })),
    };
  }
}
