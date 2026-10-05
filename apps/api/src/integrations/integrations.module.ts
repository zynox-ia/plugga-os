import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { IntegrationGate } from "./integration-gate";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsRepository } from "./integrations.repository";
import { IntegrationsService } from "./integrations.service";
import { PrismaIntegrationsRepository } from "./prisma-integrations.repository";

@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [IntegrationsController],
  providers: [
    IntegrationGate,
    IntegrationsService,
    { provide: IntegrationsRepository, useClass: PrismaIntegrationsRepository },
  ],
  exports: [IntegrationGate],
})
export class IntegrationsModule {}
