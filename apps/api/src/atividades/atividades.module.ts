import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { AtividadesController } from "./atividades.controller";
import { AtividadesRepository } from "./atividades.repository";
import { AtividadesService } from "./atividades.service";
import { PrismaAtividadesRepository } from "./prisma-atividades.repository";

@Module({
  imports: [AuditModule, CoreModule, PrismaModule], controllers: [AtividadesController],
  providers: [AtividadesService, { provide: AtividadesRepository, useClass: PrismaAtividadesRepository }],
  exports: [AtividadesService],
})
export class AtividadesModule {}
