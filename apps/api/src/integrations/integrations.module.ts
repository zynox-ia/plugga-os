import { Module } from "@nestjs/common";

import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationsRepository } from "./integrations.repository";
import { IntegrationsService } from "./integrations.service";
import { PrismaIntegrationsRepository } from "./prisma-integrations.repository";

@Module({
  imports: [CoreModule, PrismaModule],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    { provide: IntegrationsRepository, useClass: PrismaIntegrationsRepository },
  ],
})
export class IntegrationsModule {}
