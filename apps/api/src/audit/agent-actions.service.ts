import { Inject, Injectable } from "@nestjs/common";
import {
  agentActionResponseSchema,
  eventNames,
  type AgentActionResponse,
  type CreateAgentAction,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { AuditRepository } from "./audit.repository";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AgentActionsService {
  constructor(@Inject(AuditRepository) private readonly repository: AuditRepository) {}

  async create(input: CreateAgentAction, principal: AuthPrincipal): Promise<AgentActionResponse> {
    const stored = await this.repository.appendTrail(
      {
        ...input,
        requestedById: principal.kind === "user" && uuidPattern.test(principal.id)
          ? principal.id
          : null,
      },
      {
        eventName: eventNames.agentActionRecorded,
        entityType: input.entityType,
        entityId: input.entityId,
        actorType: "agent",
        actorId: input.agent,
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
