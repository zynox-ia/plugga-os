import { Module } from "@nestjs/common";

import { CoreModule } from "../core/core.module";
import { AgentActionsController } from "./agent-actions.controller";
import { AgentActionsService } from "./agent-actions.service";
import { AuditRepository } from "./audit.repository";
import { PrismaAuditRepository } from "./prisma-audit.repository";

@Module({
  imports: [CoreModule],
  controllers: [AgentActionsController],
  providers: [
    AgentActionsService,
    { provide: AuditRepository, useClass: PrismaAuditRepository },
  ],
  exports: [AuditRepository],
})
export class AuditModule {}
