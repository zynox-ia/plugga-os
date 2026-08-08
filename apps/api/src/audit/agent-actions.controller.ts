import { Body, Controller, Inject, Post, UseGuards } from "@nestjs/common";
import {
  createAgentActionSchema,
  type AgentActionResponse,
  type CreateAgentAction,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { AgentActionsService } from "./agent-actions.service";

// OriginCheckGuard belongs on every mutating route (see CoreModule), not just
// the auth ones: this endpoint writes the append-only trail.
@Controller("agent-actions")
@UseGuards(DevAuthGuard, RolesGuard, OriginCheckGuard)
@Roles("tech", "admin")
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
