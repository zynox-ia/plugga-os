import { Controller, Get, Inject, Injectable, Query, UseGuards } from "@nestjs/common";
import {
  LIMITE_DOS_LANCAMENTOS_DO_RELATORIO,
  lancamentosDoRelatorioQuerySchema,
  lancamentosDoRelatorioSchema,
  relatorioPorCategoriaQuerySchema,
  relatorioPorCategoriaSchema,
  type LancamentosDoRelatorio,
  type LancamentosDoRelatorioQuery,
  type RelatorioPorCategoria,
  type RelatorioPorCategoriaQuery,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { FinanceiroHabilitadoGuard } from "./financeiro-habilitado.guard";
import { RELOGIO_DO_FINANCEIRO, type Relogio } from "./financeiro.service";
import { papelNoFinanceiro } from "./financeiro.rules";
import { PrismaFinanceiroRepository } from "./prisma-financeiro.repository";
import { PrismaRelatoriosDoFinanceiroRepository } from "./prisma-relatorios-do-financeiro.repository";
import { periodoDoRelatorio } from "./relatorio-por-categoria.rules";

/** O relatório por categoria e os lançamentos de uma linha (PLU-360); o papel recorta os tipos e o RLS confere. */
@Injectable()
export class RelatoriosDoFinanceiroService {
  constructor(
    @Inject(PrismaRelatoriosDoFinanceiroRepository) private readonly relatorios: PrismaRelatoriosDoFinanceiroRepository,
    @Inject(PrismaFinanceiroRepository) private readonly lancamentos: PrismaFinanceiroRepository,
    @Inject(RELOGIO_DO_FINANCEIRO) private readonly agora: Relogio,
  ) {}

  async porCategoria(query: RelatorioPorCategoriaQuery, principal: AuthPrincipal): Promise<RelatorioPorCategoria> {
    return relatorioPorCategoriaSchema.parse(await this.relatorios.porCategoria(query, papelNoFinanceiro(principal.acesso)));
  }

  async lancamentosDaLinha(query: LancamentosDoRelatorioQuery, principal: AuthPrincipal): Promise<LancamentosDoRelatorio> {
    const { desde, ate } = periodoDoRelatorio(query.de, query.ate);
    const resposta = await this.lancamentos.liquidadosDoRelatorio(
      { empresa: query.empresa, desde, ate, tipo: query.tipo, categoria: query.categoria },
      papelNoFinanceiro(principal.acesso),
      LIMITE_DOS_LANCAMENTOS_DO_RELATORIO,
      this.agora(),
    );
    return lancamentosDoRelatorioSchema.parse(resposta);
  }
}

/**
 * Relatórios do Financeiro (PLU-360), da tela `financeiro.relatorios`. Só leitura.
 * Cada seção soma o que a sessão vê: as saídas com Contas a pagar, as entradas
 * com Contas a receber. Atrás do portão do Financeiro.
 */
@Controller("financeiro/relatorios")
@UseGuards(FinanceiroHabilitadoGuard, SessionAuthGuard, AcessoGuard)
@Departamento("financeiro")
@Tela("financeiro.relatorios")
export class RelatoriosDoFinanceiroController {
  constructor(@Inject(RelatoriosDoFinanceiroService) private readonly servico: RelatoriosDoFinanceiroService) {}

  @Get("categorias")
  porCategoria(
    @Query(new ZodValidationPipe(relatorioPorCategoriaQuerySchema)) query: RelatorioPorCategoriaQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<RelatorioPorCategoria> {
    return this.servico.porCategoria(query, principal);
  }

  @Get("categorias/lancamentos")
  lancamentosDaLinha(
    @Query(new ZodValidationPipe(lancamentosDoRelatorioQuerySchema)) query: LancamentosDoRelatorioQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<LancamentosDoRelatorio> {
    return this.servico.lancamentosDaLinha(query, principal);
  }
}
