import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { LeadProjetosSolaresController } from "./lead-projetos-solares.controller";
import { LeadProjetosSolaresRepository } from "./lead-projetos-solares.repository";
import { LeadProjetosSolaresService } from "./lead-projetos-solares.service";
import { PrismaLeadProjetosSolaresRepository } from "./prisma-lead-projetos-solares.repository";

@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [LeadProjetosSolaresController],
  providers: [LeadProjetosSolaresService, { provide: LeadProjetosSolaresRepository, useClass: PrismaLeadProjetosSolaresRepository }],
})
export class LeadProjetosSolaresModule {}
