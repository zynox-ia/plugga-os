import { Module } from "@nestjs/common";

import { CoreModule } from "../core/core.module";
import { LeadDocumentosModule } from "../lead-documentos/lead-documentos.module";
import { PrismaModule } from "../prisma/prisma.module";
import { LeadPropostasController } from "./lead-propostas.controller";
import { LeadPropostasPdf } from "./lead-propostas.pdf";
import { LeadPropostasRepository } from "./lead-propostas.repository";
import { LeadPropostasService } from "./lead-propostas.service";
import { PrismaLeadPropostasRepository } from "./prisma-lead-propostas.repository";

@Module({
  imports: [CoreModule, PrismaModule, LeadDocumentosModule],
  controllers: [LeadPropostasController],
  providers: [LeadPropostasService, LeadPropostasPdf, { provide: LeadPropostasRepository, useClass: PrismaLeadPropostasRepository }],
})
export class LeadPropostasModule {}
