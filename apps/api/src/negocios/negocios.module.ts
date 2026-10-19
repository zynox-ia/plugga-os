import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { NegociosController } from "./negocios.controller";
import { NegociosRepository } from "./negocios.repository";
import { NegociosService } from "./negocios.service";
import { PrismaNegociosRepository } from "./prisma-negocios.repository";

@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [NegociosController],
  providers: [NegociosService, { provide: NegociosRepository, useClass: PrismaNegociosRepository }],
})
export class NegociosModule {}
