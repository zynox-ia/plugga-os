import { Module } from "@nestjs/common";

import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { EstudoController } from "./estudo.controller.js";
import { EstudoRepository } from "./estudo.repository.js";
import { EstudoService } from "./estudo.service.js";
import { PrismaEstudoRepository } from "./prisma-estudo.repository.js";

@Module({
  imports: [CoreModule, PrismaModule],
  controllers: [EstudoController],
  providers: [EstudoService, { provide: EstudoRepository, useClass: PrismaEstudoRepository }],
})
export class EnergyEfficiencyModule {}
