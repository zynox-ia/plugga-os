import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import {
  agentActionResponseSchema,
  eventNames,
  type AgentActionResponse,
  type CreateAgentAction,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { AuditPort } from "./audit.port";
import { AgentActionScope } from "./agent-action-scope";

@Injectable()
export class AgentActionsService {
  constructor(@Inject(AuditPort) private readonly repository: AuditPort, @Inject(AgentActionScope) private readonly scope: AgentActionScope) {}

  async create(input: CreateAgentAction, principal: AuthPrincipal): Promise<AgentActionResponse> {
    const authenticatedAgent = principal.kind === "service"
      ? principal.id
      : null;

    if (!authenticatedAgent || authenticatedAgent !== input.agent) {
      throw new ForbiddenException(
        "agent identity must match the authenticated service principal",
      );
    }

    if (["approved", "rejected"].includes(input.approvalStatus) || !await this.scope.permite(principal, input.entityType, input.entityId)) {
      throw new ForbiddenException("A entidade ou aprovação não está no alcance do agente.");
    }

    const stored = await this.repository.appendTrail(
      {
        ...input,
        agent: authenticatedAgent,
        agentUserId: principal.id,
        requestedById: null,
        // A trilha registra metadados; conteúdo arbitrário pode carregar dados pessoais ou segredos.
        input: {}, payload: {}, result: undefined, error: undefined,
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
