import { Body, Controller, Header, HttpCode, Inject, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { criacaoDeAgenteSchema, type CriacaoDeAgente } from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Authenticated } from "../core/auth/access.decorators";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { AgentesEquipeService } from "./agentes-equipe.service";

@Authenticated()
@Controller("equipe/agentes")
@UseGuards(OriginCheckGuard, SessionAuthGuard, ThrottlerGuard)
export class AgentesEquipeController {
  constructor(@Inject(AgentesEquipeService) private readonly service: AgentesEquipeService) {}

  @Post()
  criar(@Body(new ZodValidationPipe(criacaoDeAgenteSchema)) input: CriacaoDeAgente, @CurrentPrincipal() principal: AuthPrincipal) {
    return this.service.criar(principal, input);
  }

  @Post(":id/credencial")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  emitirCredencial(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal) {
    return this.service.emitirCredencial(principal, id);
  }

  @Post(":id/revogar-credencial")
  @HttpCode(200)
  revogarCredencial(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal) {
    return this.service.revogarCredencial(principal, id);
  }
}
