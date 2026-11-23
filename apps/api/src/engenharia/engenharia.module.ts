import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { ComprasModule } from "../compras/compras.module";
import { CoreModule } from "../core/core.module";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { PrismaModule } from "../prisma/prisma.module";
import { TarefasModule } from "../tarefas/tarefas.module";
import { EngenhariaHabilitadaGuard } from "./engenharia-habilitada.guard";
import { ConfiguracoesDaEngenhariaController, EngenhariaController, VisaoGeralDaEngenhariaController } from "./engenharia.controller";
import { EngenhariaService, RELOGIO_DA_ENGENHARIA } from "./engenharia.service";
import { PrismaEngenhariaRepository } from "./prisma-engenharia.repository";
import { PrismaUsinasRepository } from "./prisma-usinas.repository";
import { MonitoramentoController, PlataformasController, UsinasController } from "./usinas.controller";
import { UsinasService } from "./usinas.service";
import { TermoDaOrdemPdf } from "./termo-da-ordem.pdf";

/**
 * Engenharia e Obras (PLU-345). Arquivos no mesmo armazenamento dos documentos,
 * sob `engenharia/ordens-de-servico/`; o material sai pelo serviço de Compras.
 */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule, ComprasModule, TarefasModule],
  controllers: [EngenhariaController, VisaoGeralDaEngenhariaController, ConfiguracoesDaEngenhariaController, UsinasController, MonitoramentoController, PlataformasController],
  providers: [
    EngenhariaHabilitadaGuard,
    EngenhariaService,
    PrismaEngenhariaRepository,
    PrismaUsinasRepository,
    UsinasService,
    ArmazenamentoDeDocumentos,
    TermoDaOrdemPdf,
    { provide: RELOGIO_DA_ENGENHARIA, useValue: () => new Date() },
  ],
})
export class EngenhariaModule {}
