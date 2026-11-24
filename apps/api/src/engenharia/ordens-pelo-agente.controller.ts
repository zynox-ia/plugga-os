import { Body, Controller, Headers, Inject, Post, Res, UseGuards } from "@nestjs/common";
import { criarOrdemPeloAgenteSchema, type CriarOrdemPeloAgente, type OrdemPeloAgenteResposta } from "@plugga/shared";
import type { Response } from "express";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AcaoDeAgente, AcaoDeAgenteGuard } from "../core/auth/acao-de-agente";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { ThrottlerPorAgenteGuard } from "../core/auth/throttler-por-agente.guard";
import { EngenhariaHabilitadaGuard } from "./engenharia-habilitada.guard";
import { TELAS_DAS_ORDENS } from "./engenharia.rules";
import { OrdensPeloAgenteService } from "./ordens-pelo-agente.service";

/**
 * Entrada de O.S. pelo robô (PLU-351): só a identidade de agente com a ação
 * `engenharia.ordem.criar` e uma tela de O.S. O portão vem antes da sessão; o
 * limite de taxa conta por agente. 201 na criação; 200 no pedido repetido.
 */
@Controller("agentes/engenharia/ordens-de-servico")
@UseGuards(EngenhariaHabilitadaGuard, SessionAuthGuard, AcaoDeAgenteGuard, AcessoGuard)
@AcaoDeAgente("engenharia.ordem.criar")
@Departamento(["engenharia-obras"])
@Tela(...TELAS_DAS_ORDENS)
export class OrdensPeloAgenteController {
  constructor(@Inject(OrdensPeloAgenteService) private readonly servico: OrdensPeloAgenteService) {}

  @Post()
  @UseGuards(OriginCheckGuard, ThrottlerPorAgenteGuard)
  async criar(
    @Headers("idempotency-key") chave: string | undefined,
    @Body(new ZodValidationPipe(criarOrdemPeloAgenteSchema)) input: CriarOrdemPeloAgente,
    @CurrentPrincipal() principal: AuthPrincipal,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OrdemPeloAgenteResposta> {
    const { resposta, criada } = await this.servico.criar(chave, input, principal);
    res.status(criada ? 201 : 200);
    return resposta;
  }
}
