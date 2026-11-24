import { Controller, HttpCode, Inject, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Lancamento } from "@plugga/shared";

import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { FinanceiroHabilitadoGuard } from "../financeiro/financeiro-habilitado.guard";
import { FinanceiroService, RELOGIO_DO_FINANCEIRO } from "../financeiro/financeiro.service";
import { PrismaOmieLancamentosRepository } from "./prisma-omie-lancamentos.repository";

/** O "Tentar de novo" é do conector (`/integracoes/omie/lancamentos/:id/tentar-de-novo`). */
@Controller()
@UseGuards(FinanceiroHabilitadoGuard, SessionAuthGuard, AcessoGuard)
// O mesmo acesso da rota antiga do FinanceiroController: departamento e tela.
@Departamento("financeiro")
@Tela("financeiro.pagar", "financeiro.receber")
export class OmieLancamentosController {
  constructor(
    @Inject(PrismaOmieLancamentosRepository) private readonly omie: PrismaOmieLancamentosRepository,
    @Inject(FinanceiroService) private readonly financeiro: FinanceiroService,
    @Inject(RELOGIO_DO_FINANCEIRO) private readonly agora: () => Date,
  ) {}

  /** 200 com o lançamento atualizado; 409 se não há envio com erro. */
  @Post("integracoes/omie/lancamentos/:id/tentar-de-novo")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async tentarDeNovo(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<Lancamento> {
    await this.omie.tentarDeNovo(id, principal, this.agora());
    return this.financeiro.obter(id, principal);
  }
}
