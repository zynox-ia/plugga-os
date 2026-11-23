import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { FinanceiroHabilitadoGuard } from "../financeiro/financeiro-habilitado.guard";
import { PrismaSegredoRepository } from "../llm/prisma-segredo.repository.js";
import { SegredoRepository } from "../llm/segredo.repository.js";
import { PrismaModule } from "../prisma/prisma.module";
import { OmieCofreService, OmieLeitura } from "./omie-cofre.service";
import { OmieConexoesService, OmieLeituraPorEmpresa } from "./omie-conexoes.service";
import { OmieEmpresasController } from "./omie-empresas.controller";
import { OmieController } from "./omie.controller";
import { OmieHttpAdapter } from "./omie-http.adapter";
import { OmiePort } from "./omie.port";
import { PrismaOmieConexoesRepository } from "./prisma-omie-conexoes.repository";
import { PrismaOmieLeituraPorEmpresa } from "./prisma-omie-leitura-por-empresa.repository";
import { PrismaOmieLeitura } from "./prisma-omie-leitura.repository";

/** OMIE: a conta única antiga (OmieCofreService) e as conexões por empresa (PLU-342), exportadas para o Financeiro. */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [OmieController, OmieEmpresasController],
  providers: [
    FinanceiroHabilitadoGuard,
    OmieCofreService,
    OmieConexoesService,
    PrismaOmieConexoesRepository,
    { provide: OmieLeituraPorEmpresa, useClass: PrismaOmieLeituraPorEmpresa },
    { provide: OmiePort, useClass: OmieHttpAdapter },
    { provide: OmieLeitura, useClass: PrismaOmieLeitura },
    { provide: SegredoRepository, useClass: PrismaSegredoRepository },
  ],
  exports: [OmieCofreService, OmieConexoesService],
})
export class OmieModule {}
