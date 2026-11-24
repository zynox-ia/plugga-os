import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { PrismaModule } from "../prisma/prisma.module";
import { CadastrosDoFinanceiroController } from "./cadastros-do-financeiro.controller";
import { ConciliacaoController } from "./conciliacao.controller";
import { TransferenciasController } from "./transferencias.controller";
import { ConciliacaoService } from "./conciliacao.service";
import { PrismaConciliacaoRepository } from "./prisma-conciliacao.repository";
import { PrismaCadastrosDoFinanceiroRepository } from "./prisma-cadastros-do-financeiro.repository";
import { PrismaContaDaCompraRepository } from "./prisma-conta-da-compra.repository";
import { FinanceiroHabilitadoGuard } from "./financeiro-habilitado.guard";
import { FinanceiroController } from "./financeiro.controller";
import { FinanceiroService, RELOGIO_DO_FINANCEIRO } from "./financeiro.service";
import { PrismaFinanceiroRepository } from "./prisma-financeiro.repository";
import { ReflexosDoLancamento } from "./reflexo-do-lancamento";

/**
 * Financeiro (PLU-336): lançamentos, cadastros, as ações de etapa e a conciliação. O Plugga
 * OS é o financeiro, sozinho: a integração com o OMIE foi extinta (decisão do André de
 * 24/11/2026). `ReflexosDoLancamento` fica como a porta genérica dos fatos do lançamento,
 * para quem precisar ouvir (os provedores de boleto e NF, no futuro).
 */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [FinanceiroController, CadastrosDoFinanceiroController, ConciliacaoController, TransferenciasController],
  providers: [
    FinanceiroHabilitadoGuard,
    PrismaCadastrosDoFinanceiroRepository,
    PrismaContaDaCompraRepository,
    ConciliacaoService,
    PrismaConciliacaoRepository,
    ArmazenamentoDeDocumentos,
    FinanceiroService,
    PrismaFinanceiroRepository,
    ReflexosDoLancamento,
    { provide: RELOGIO_DO_FINANCEIRO, useValue: () => new Date() },
  ],
  exports: [PrismaFinanceiroRepository, PrismaContaDaCompraRepository, ReflexosDoLancamento, FinanceiroService, RELOGIO_DO_FINANCEIRO],
})
export class FinanceiroModule {}
