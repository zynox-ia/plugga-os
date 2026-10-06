import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module";
import { HealthController } from "./health.controller";
import { HealthRepository } from "./health.repository";
import { HealthService } from "./health.service";
import { PrismaHealthRepository } from "./prisma-health.repository";

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [HealthService, { provide: HealthRepository, useClass: PrismaHealthRepository }],
})
export class HealthModule {}
