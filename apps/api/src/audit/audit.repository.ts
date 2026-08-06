import type { ActorType } from "@prisma/client";
import type { AgentActionStatus, EventName } from "@plugga/shared";

export interface AgentActionAppend {
  agent: string;
  requestedById: string | null;
  channel: string;
  action: string;
  entityType: string;
  entityId: string;
  input: Record<string, unknown>;
  payload: Record<string, unknown>;
  decision: string;
  approvalStatus: string;
  status: AgentActionStatus;
  result?: string;
  error?: string;
}

export interface EventAppend {
  eventName: EventName;
  entityType: string;
  entityId: string;
  actorType: ActorType;
  actorId: string | null;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export interface StoredAgentAction {
  id: string;
  status: AgentActionStatus;
  createdAt: Date;
}

export abstract class AuditRepository {
  abstract appendEvent(event: EventAppend): Promise<void>;

  abstract appendTrail(
    agentAction: AgentActionAppend,
    event: EventAppend,
  ): Promise<StoredAgentAction>;
}
