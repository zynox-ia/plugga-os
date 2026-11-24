import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaSegredoRepository } from "../llm/prisma-segredo.repository.js";
import { SegredoRepository } from "../llm/segredo.repository.js";
import { PrismaModule } from "../prisma/prisma.module";
import { BrasilApiAdapter } from "./brasilapi.adapter";
import { CadastroIntegracaoController } from "./cadastro-integracao.controller";
import { CadastroController } from "./cadastro.controller";
import { ConsultaCadastralPort } from "./consulta-cadastral.port";
import { ConsultaCadastralService, IntegracaoAtivaRepository } from "./consulta-cadastral.service";
import { PrismaIntegracaoAtivaRepository } from "./prisma-integracao-ativa.repository";

/** Consulta de CNPJ e CEP (BrasilAPI) com liga/desliga da plataforma. O serviço é exportado para as telas e jobs. */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [CadastroController, CadastroIntegracaoController],
  providers: [
    ConsultaCadastralService,
    { provide: ConsultaCadastralPort, useClass: BrasilApiAdapter },
    { provide: IntegracaoAtivaRepository, useClass: PrismaIntegracaoAtivaRepository },
    { provide: SegredoRepository, useClass: PrismaSegredoRepository },
  ],
  exports: [ConsultaCadastralService],
})
export class CadastroModule {}
