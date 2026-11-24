import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { activateSolarProcessRequestSchema, type ActivateSolarProcessRequest } from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { ProcessoSolarService } from "./processo-solar.service";

/** Processo comercial Solar (PLU-312): ativação no pipeline e situação de cada negócio. */
@Controller()
@UseGuards(SessionAuthGuard, AcessoGuard)
@Departamento("crm")
@Tela("crm.pipelines")
export class ProcessoSolarController {
  constructor(@Inject(ProcessoSolarService) private readonly service: ProcessoSolarService) {}

  @Get("leads/:dealId/processo-solar")
  situacao(@Param("dealId", ParseUUIDPipe) dealId: string, @CurrentPrincipal() principal: AuthPrincipal) {
    return this.service.situacao(dealId, principal);
  }

  @Post("pipelines/:pipelineId/processo-solar/ativacao")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  ativar(
    @Param("pipelineId", ParseUUIDPipe) pipelineId: string,
    @Body(new ZodValidationPipe(activateSolarProcessRequestSchema)) input: ActivateSolarProcessRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ) {
    return this.service.ativar(pipelineId, input, principal);
  }
}
