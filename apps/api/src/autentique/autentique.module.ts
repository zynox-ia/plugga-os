import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaSegredoRepository } from "../llm/prisma-segredo.repository.js";
import { SegredoRepository } from "../llm/segredo.repository.js";
import { PrismaModule } from "../prisma/prisma.module";
import { AutentiqueCofreService, AutentiqueLeitura } from "./autentique-cofre.service";
import { AutentiqueController } from "./autentique.controller";
import { AutentiqueHttpAdapter } from "./autentique-http.adapter";
import { AutentiquePort } from "./autentique.port";
import { PrismaAutentiqueLeitura } from "./prisma-autentique-leitura.repository";

/** Autentique da plataforma, uma conta por empresa. O serviço é exportado para os fluxos de contrato. */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [AutentiqueController],
  providers: [
    AutentiqueCofreService,
    { provide: AutentiquePort, useClass: AutentiqueHttpAdapter },
    { provide: AutentiqueLeitura, useClass: PrismaAutentiqueLeitura },
    { provide: SegredoRepository, useClass: PrismaSegredoRepository },
  ],
  exports: [AutentiqueCofreService],
})
export class AutentiqueModule {}
