import { Module } from "@nestjs/common";

import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AgentActionsController } from "./agent-actions.controller";
import { AgentActionsService } from "./agent-actions.service";
import { AuditAppender } from "./audit-appender";
import { AuditRepository } from "./audit.repository";
import { PrismaAuditRepository } from "./prisma-audit.repository";

@Module({
  imports: [CoreModule, PrismaModule],
  controllers: [AgentActionsController],
  providers: [
    AgentActionsService,
    AuditAppender,
    { provide: AuditRepository, useClass: PrismaAuditRepository },
  ],
  exports: [AuditRepository, AuditAppender],
})
export class AuditModule {}
