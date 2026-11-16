import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ProcessoSolarController } from "./processo-solar.controller";
import { PrismaProcessoSolarRepository } from "./prisma-processo-solar.repository";
import { ProcessoSolarRepository } from "./processo-solar.repository";
import { ProcessoSolarService } from "./processo-solar.service";

@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [ProcessoSolarController],
  providers: [ProcessoSolarService, { provide: ProcessoSolarRepository, useClass: PrismaProcessoSolarRepository }],
})
export class ProcessoSolarModule {}
