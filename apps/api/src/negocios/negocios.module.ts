import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { ClientesModule } from "../clientes/clientes.module";
import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { NegociosController } from "./negocios.controller";
import { DetalhesNegocioController } from "./detalhes-negocio.controller";
import { NegociosRepository } from "./negocios.repository";
import { NegociosService } from "./negocios.service";
import { PrismaNegociosRepository } from "./prisma-negocios.repository";

@Module({
  imports: [AuditModule, ClientesModule, CoreModule, PrismaModule],
  controllers: [NegociosController, DetalhesNegocioController],
  providers: [NegociosService, { provide: NegociosRepository, useClass: PrismaNegociosRepository }],
})
export class NegociosModule {}
