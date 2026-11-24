import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { AuditPort, type EventAppend } from "./audit.port";
import { PrismaAuthService } from "../prisma/prisma-auth.service";

/** Auth precisa auditar login/reset sem sessão; este pool só alcança auth e event_log. */
@Injectable()
export class PrismaAuthAuditRepository extends AuditPort {
  constructor(@Inject(PrismaAuthService) private readonly prisma: PrismaAuthService) {
    super();
  }

  async appendEvent(event: EventAppend): Promise<void> {
    await this.prisma.eventLog.createMany({
      data: { ...event, payload: event.payload as Prisma.InputJsonObject },
    });
  }

  readonly appendTrail: AuditPort["appendTrail"] = async () => {
    throw new Error("Trilha de agente fora do escopo do pool de autenticação.");
  };
}
