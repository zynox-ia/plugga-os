import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import {
  agentActionResponseSchema,
  eventNames,
  type AgentActionResponse,
  type CreateAgentAction,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { AuditRepository } from "./audit.repository";

@Injectable()
export class AgentActionsService {
  constructor(@Inject(AuditRepository) private readonly repository: AuditRepository) {}

  async create(input: CreateAgentAction, principal: AuthPrincipal): Promise<AgentActionResponse> {
    const authenticatedAgent = principal.kind === "service"
      ? principal.id.slice("service:".length)
      : null;

    if (!authenticatedAgent || authenticatedAgent !== input.agent) {
      throw new ForbiddenException(
        "agent identity must match the authenticated service principal",
      );
    }

    const stored = await this.repository.appendTrail(
      {
        ...input,
        agent: authenticatedAgent,
        requestedById: null,
      },
      {
        eventName: eventNames.agentActionRecorded,
        entityType: input.entityType,
        entityId: input.entityId,
        actorType: "agent",
        actorId: authenticatedAgent,
        payload: {
          action: input.action,
          channel: input.channel,
          decision: input.decision,
          status: input.status,
          requestedByPrincipal: principal.id,
        },
        occurredAt: new Date(),
      },
    );

    return agentActionResponseSchema.parse({
      ...stored,
      createdAt: stored.createdAt.toISOString(),
    });
  }
}
