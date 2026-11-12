import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaSegredoRepository } from "../llm/prisma-segredo.repository.js";
import { SegredoRepository } from "../llm/segredo.repository.js";
import { PrismaModule } from "../prisma/prisma.module";
import { OmieCofreService, OmieLeitura } from "./omie-cofre.service";
import { OmieController } from "./omie.controller";
import { OmieHttpAdapter } from "./omie-http.adapter";
import { OmiePort } from "./omie.port";
import { PrismaOmieLeitura } from "./prisma-omie-leitura.repository";

/** OMIE da plataforma. O serviço é exportado para os fluxos de cliente, pedido e nota fiscal. */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [OmieController],
  providers: [
    OmieCofreService,
    { provide: OmiePort, useClass: OmieHttpAdapter },
    { provide: OmieLeitura, useClass: PrismaOmieLeitura },
    { provide: SegredoRepository, useClass: PrismaSegredoRepository },
  ],
  exports: [OmieCofreService],
})
export class OmieModule {}
