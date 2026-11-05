import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ArmazenamentoDeDocumentos } from "./armazenamento-de-documentos";
import { LeadDocumentosController } from "./lead-documentos.controller";
import { LeadDocumentosRepository } from "./lead-documentos.repository";
import { LeadDocumentosService } from "./lead-documentos.service";
import { PrismaLeadDocumentosRepository } from "./prisma-lead-documentos.repository";

@Module({
  exports: [LeadDocumentosService],
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [LeadDocumentosController],
  providers: [
    LeadDocumentosService,
    ArmazenamentoDeDocumentos,
    { provide: LeadDocumentosRepository, useClass: PrismaLeadDocumentosRepository },
  ],
})
export class LeadDocumentosModule {}
