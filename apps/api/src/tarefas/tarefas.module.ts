import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { PrismaModule } from "../prisma/prisma.module";
import { PortaoDoDepartamentoGuard } from "./portao-do-departamento.guard";
import { PrismaTarefasRepository } from "./prisma-tarefas.repository";
import { TarefasController } from "./tarefas.controller";
import { RELOGIO_DAS_TAREFAS, TarefasService } from "./tarefas.service";

/**
 * Tarefas dos departamentos (PLU-349, PLU-340). Evidências no mesmo
 * armazenamento dos documentos, sob `tarefas/`. Os módulos que concluem tarefas
 * automáticas importam este e usam `TarefasService.concluirAutomatica`.
 */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule],
  controllers: [TarefasController],
  providers: [
    PortaoDoDepartamentoGuard,
    TarefasService,
    PrismaTarefasRepository,
    ArmazenamentoDeDocumentos,
    { provide: RELOGIO_DAS_TAREFAS, useValue: () => new Date() },
  ],
  exports: [TarefasService],
})
export class TarefasModule {}
