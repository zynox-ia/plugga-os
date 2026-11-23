import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  acaoDoLancamentoSchema,
  criarContaAPagarSchema,
  editarLancamentoSchema,
  listarLancamentosQuerySchema,
  quadroFinanceiroQuerySchema,
  type AcaoDoLancamento,
  type CriarContaAPagar,
  type EditarLancamento,
  type Lancamento,
  type ListarLancamentosQuery,
  type ListarLancamentosResposta,
  type OpcoesDoFinanceiro,
  type QuadroFinanceiro,
  type QuadroFinanceiroQuery,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { FinanceiroHabilitadoGuard } from "./financeiro-habilitado.guard";
import { FinanceiroService } from "./financeiro.service";

/**
 * Financeiro (PLU-336). Os Lançamentos são de quem tem Contas a pagar ou Contas
 * a receber; cada um vê só o seu tipo (o serviço e o RLS recortam). Atrás do
 * portão `FinanceiroHabilitadoGuard` até o módulo ficar completo.
 */
@Controller("financeiro")
@UseGuards(FinanceiroHabilitadoGuard, SessionAuthGuard, AcessoGuard)
@Departamento("financeiro")
@Tela("financeiro.pagar", "financeiro.receber")
export class FinanceiroController {
  constructor(@Inject(FinanceiroService) private readonly financeiro: FinanceiroService) {}

  @Get("lancamentos")
  listar(
    @Query(new ZodValidationPipe(listarLancamentosQuerySchema)) query: ListarLancamentosQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ListarLancamentosResposta> {
    return this.financeiro.listar(query, principal);
  }

  @Get("lancamentos/quadro")
  quadro(
    @Query(new ZodValidationPipe(quadroFinanceiroQuerySchema)) query: QuadroFinanceiroQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<QuadroFinanceiro> {
    return this.financeiro.quadro(query, principal);
  }

  @Get("lancamentos/:id")
  obter(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<Lancamento> {
    return this.financeiro.obter(id, principal);
  }

  @Post("lancamentos")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  criar(
    @Body(new ZodValidationPipe(criarContaAPagarSchema)) input: CriarContaAPagar,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Lancamento> {
    return this.financeiro.criarContaAPagar(input, principal);
  }

  @Patch("lancamentos/:id")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  editar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(editarLancamentoSchema)) input: EditarLancamento,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Lancamento> {
    return this.financeiro.editar(id, input, principal);
  }

  @Post("lancamentos/:id/acoes")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  executarAcao(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(acaoDoLancamentoSchema)) acao: AcaoDoLancamento,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Lancamento> {
    return this.financeiro.executarAcao(id, acao, principal);
  }

  /** Menus dos formulários e filtros: vale para qualquer tela do Financeiro. */
  @Get("opcoes")
  @Tela("financeiro.pagar", "financeiro.receber", "financeiro.conciliacao", "financeiro.fiscal")
  opcoes(): Promise<OpcoesDoFinanceiro> {
    return this.financeiro.opcoes();
  }
}
