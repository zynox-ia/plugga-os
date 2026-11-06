import { Module } from "@nestjs/common";

import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AgentActionsController } from "./agent-actions.controller";
import { AgentActionsService } from "./agent-actions.service";
import { AuditAppender } from "./audit-appender";
import { AuditPort } from "./audit.port";
import { PrismaAuditRepository } from "./prisma-audit.repository";
import { AgentActionScope } from "./agent-action-scope";
import { PrismaAgentActionScope } from "./prisma-agent-action-scope.repository";
import { IdentidadeAgenteGuard } from "../core/auth/identidade-agente.guard";

@Module({
  imports: [CoreModule, PrismaModule],
  controllers: [AgentActionsController],
  providers: [
    AgentActionsService,
    IdentidadeAgenteGuard,
    { provide: AgentActionScope, useClass: PrismaAgentActionScope },
    AuditAppender,
    { provide: AuditPort, useClass: PrismaAuditRepository },
  ],
  exports: [AuditPort, AuditAppender],
})
export class AuditModule {}
