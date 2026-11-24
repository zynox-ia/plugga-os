import { Body, Controller, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { criarTransferenciaSchema, type CriarTransferencia, type TransferenciaCriada } from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { ConciliacaoService } from "./conciliacao.service";
import { FinanceiroHabilitadoGuard } from "./financeiro-habilitado.guard";

/**
 * A transferência entre contas da mesma empresa (PLU-339, C6), fora da Conciliação: só a
 * gerência do Financeiro. As duas pernas nascem liquidadas e esperam o extrato de cada conta.
 */
@Controller("financeiro")
@UseGuards(FinanceiroHabilitadoGuard, SessionAuthGuard, AcessoGuard, OriginCheckGuard, ThrottlerGuard)
@Departamento("financeiro", "gerente")
@Tela("financeiro.pagar", "financeiro.receber", "financeiro.conciliacao")
export class TransferenciasController {
  constructor(@Inject(ConciliacaoService) private readonly conciliacao: ConciliacaoService) {}

  @Post("transferencias")
  @HttpCode(201)
  criar(@Body(new ZodValidationPipe(criarTransferenciaSchema)) entrada: CriarTransferencia, @CurrentPrincipal() principal: AuthPrincipal): Promise<TransferenciaCriada> {
    return this.conciliacao.criarTransferencia(entrada, principal);
  }
}
