import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import {
  createAgentActionSchema,
  type AgentActionResponse,
  type CreateAgentAction,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { Authenticated } from "../core/auth/access.decorators";
import { IdentidadeAgenteGuard } from "../core/auth/identidade-agente.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { AgentActionsService } from "./agent-actions.service";

@Controller("agent-actions")
// OriginCheckGuard primeiro: é uma mutação autenticada por cookie, e uma origem
// recusada não deve nem chegar à resolução de sessão (US11, T119).
@UseGuards(OriginCheckGuard, SessionAuthGuard, IdentidadeAgenteGuard)
@Authenticated()
export class AgentActionsController {
  constructor(@Inject(AgentActionsService) private readonly service: AgentActionsService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createAgentActionSchema)) input: CreateAgentAction,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<AgentActionResponse> {
    return this.service.create(input, principal);
  }
}
