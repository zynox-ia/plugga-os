import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { PrismaModule } from "../prisma/prisma.module";
import { FinanceiroHabilitadoGuard } from "./financeiro-habilitado.guard";
import { FinanceiroController } from "./financeiro.controller";
import { FinanceiroService, RELOGIO_DO_FINANCEIRO } from "./financeiro.service";
import { PrismaFinanceiroRepository } from "./prisma-financeiro.repository";

/** Financeiro (PLU-336): lançamentos, cadastros espelhados do OMIE e as ações de etapa. */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [FinanceiroController],
  providers: [FinanceiroHabilitadoGuard, FinanceiroService, PrismaFinanceiroRepository, { provide: RELOGIO_DO_FINANCEIRO, useValue: () => new Date() }],
  exports: [PrismaFinanceiroRepository],
})
export class FinanceiroModule {}
