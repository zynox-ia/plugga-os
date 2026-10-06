import { Module } from "@nestjs/common";

import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AgentActionsController } from "./agent-actions.controller";
import { AgentActionsService } from "./agent-actions.service";
import { AuditAppender } from "./audit-appender";
import { AuditPort } from "./audit.port";
import { PrismaAuditRepository } from "./prisma-audit.repository";

@Module({
  imports: [CoreModule, PrismaModule],
  controllers: [AgentActionsController],
  providers: [
    AgentActionsService,
    AuditAppender,
    { provide: AuditPort, useClass: PrismaAuditRepository },
  ],
  exports: [AuditPort, AuditAppender],
})
export class AuditModule {}
