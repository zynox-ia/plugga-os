import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { PipelinesController } from "./pipelines.controller";
import { PipelinesRepository } from "./pipelines.repository";
import { PipelinesService } from "./pipelines.service";
import { PrismaPipelinesRepository } from "./prisma-pipelines.repository";

@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [PipelinesController],
  providers: [PipelinesService, { provide: PipelinesRepository, useClass: PrismaPipelinesRepository }],
})
export class PipelinesModule {}
