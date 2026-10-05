import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { EnergyController } from "./energy.controller";
import { EnergyRepository } from "./energy.repository";
import { EnergyService } from "./energy.service";
import { PrismaEnergyRepository } from "./prisma-energy.repository";

@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [EnergyController],
  providers: [EnergyService, { provide: EnergyRepository, useClass: PrismaEnergyRepository }],
})
export class EnergyModule {}
