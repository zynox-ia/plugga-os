import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { PrismaModule } from "../prisma/prisma.module";
import { ConectoresDoFinanceiro } from "./conectores-do-financeiro";
import { FinanceiroHabilitadoGuard } from "./financeiro-habilitado.guard";
import { FinanceiroController } from "./financeiro.controller";
import { FinanceiroService, RELOGIO_DO_FINANCEIRO } from "./financeiro.service";
import { PrismaFinanceiroRepository } from "./prisma-financeiro.repository";
import { ReflexosDoLancamento } from "./reflexo-do-lancamento";

/**
 * Financeiro (PLU-336): lançamentos, cadastros e as ações de etapa. É o dono dos dados
 * (decisão de 24/11/2026): não conhece nenhum sistema de fora. Os conectores (o OMIE é
 * um) importam este módulo, se inscrevem em `ReflexosDoLancamento` para ouvir as
 * mudanças e em `ConectoresDoFinanceiro` para a tela saber se estão conectados.
 */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [FinanceiroController],
  providers: [
    FinanceiroHabilitadoGuard,
    ArmazenamentoDeDocumentos,
    FinanceiroService,
    PrismaFinanceiroRepository,
    ReflexosDoLancamento,
    ConectoresDoFinanceiro,
    { provide: RELOGIO_DO_FINANCEIRO, useValue: () => new Date() },
  ],
  exports: [PrismaFinanceiroRepository, ReflexosDoLancamento, ConectoresDoFinanceiro, FinanceiroService, RELOGIO_DO_FINANCEIRO],
})
export class FinanceiroModule {}
