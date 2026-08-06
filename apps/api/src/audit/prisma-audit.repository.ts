import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import {
  AuditRepository,
  type AgentActionAppend,
  type EventAppend,
  type StoredAgentAction,
} from "./audit.repository";

@Injectable()
export class PrismaAuditRepository extends AuditRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async appendTrail(
    agentAction: AgentActionAppend,
    event: EventAppend,
  ): Promise<StoredAgentAction> {
    const [storedAction] = await this.prisma.$transaction([
      this.prisma.agentAction.create({
        data: {
          ...agentAction,
          input: agentAction.input as Prisma.InputJsonObject,
          payload: agentAction.payload as Prisma.InputJsonObject,
        },
        select: { id: true, status: true, createdAt: true },
      }),
      this.prisma.eventLog.create({
        data: {
          ...event,
          payload: event.payload as Prisma.InputJsonObject,
        },
        select: { id: true },
      }),
    ]);

    return {
      id: storedAction.id,
      status: storedAction.status as StoredAgentAction["status"],
      createdAt: storedAction.createdAt,
    };
  }
}
