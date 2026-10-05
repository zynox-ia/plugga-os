import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ArmazenamentoDeEvidencias } from "./armazenamento-de-evidencias";
import { ObrasEscopoRepository, PrismaObrasEscopoRepository } from "./obras-escopo.repository";
import { ObrasController } from "./obras.controller";
import { ObrasRepository } from "./obras.repository";
import { ObrasService } from "./obras.service";
import { PrismaObrasRepository } from "./prisma-obras.repository";

@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [ObrasController],
  providers: [
    ObrasService,
    ArmazenamentoDeEvidencias,
    { provide: ObrasRepository, useClass: PrismaObrasRepository },
    { provide: ObrasEscopoRepository, useClass: PrismaObrasEscopoRepository },
  ],
})
export class ObrasModule {}
