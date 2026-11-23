import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { PrismaModule } from "../prisma/prisma.module";
import { ComprasController } from "./compras.controller";
import { ComprasService, RELOGIO_DE_COMPRAS } from "./compras.service";
import { PrismaComprasRepository } from "./prisma-compras.repository";

/** Anexos no mesmo armazenamento dos documentos do lead, sob o prefixo `suprimentos/compras/`. */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [ComprasController],
  providers: [
    ComprasService,
    PrismaComprasRepository,
    ArmazenamentoDeDocumentos,
    { provide: RELOGIO_DE_COMPRAS, useValue: () => new Date() },
  ],
})
export class ComprasModule {}
