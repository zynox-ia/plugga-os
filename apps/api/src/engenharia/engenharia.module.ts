import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { ComprasModule } from "../compras/compras.module";
import { CoreModule } from "../core/core.module";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { PrismaModule } from "../prisma/prisma.module";
import { TarefasModule } from "../tarefas/tarefas.module";
import { EngenhariaHabilitadaGuard } from "./engenharia-habilitada.guard";
import { AgendaDeCampoController, ConfiguracoesDaEngenhariaController, EngenhariaController, VisaoGeralDaEngenhariaController } from "./engenharia.controller";
import { EngenhariaService, RELOGIO_DA_ENGENHARIA } from "./engenharia.service";
import { PrismaEngenhariaRepository } from "./prisma-engenharia.repository";
import { AcaoDeAgenteGuard } from "../core/auth/acao-de-agente";
import { ThrottlerPorAgenteGuard } from "../core/auth/throttler-por-agente.guard";
import { ObrasController } from "./obras.controller";
import { ObrasService } from "./obras.service";
import { OrdensPeloAgenteController } from "./ordens-pelo-agente.controller";
import { OrdensPeloAgenteService } from "./ordens-pelo-agente.service";
import { PrismaObrasRepository } from "./prisma-obras.repository";
import { PrismaOrdensPeloAgenteRepository } from "./prisma-ordens-pelo-agente.repository";
import { PrismaProtocolosRepository } from "./prisma-protocolos.repository";
import { PrismaUsinasRepository } from "./prisma-usinas.repository";
import { ProtocolosController } from "./protocolos.controller";
import { ProtocolosService } from "./protocolos.service";
import { MonitoramentoController, PlataformasController, UsinasController } from "./usinas.controller";
import { UsinasService } from "./usinas.service";
import { TermoDaOrdemPdf } from "./termo-da-ordem.pdf";

/**
 * Engenharia e Obras (PLU-345). Arquivos no mesmo armazenamento dos documentos,
 * sob `engenharia/ordens-de-servico/`; o material sai pelo serviço de Compras.
 */
@Module({
  imports: [AuditModule, CoreModule, PrismaModule, ComprasModule, TarefasModule],
  controllers: [EngenhariaController, VisaoGeralDaEngenhariaController, ConfiguracoesDaEngenhariaController, AgendaDeCampoController, UsinasController, MonitoramentoController, PlataformasController, ProtocolosController, OrdensPeloAgenteController, ObrasController],
  providers: [
    EngenhariaHabilitadaGuard,
    EngenhariaService,
    PrismaEngenhariaRepository,
    PrismaUsinasRepository,
    UsinasService,
    PrismaProtocolosRepository,
    ProtocolosService,
    OrdensPeloAgenteService,
    PrismaOrdensPeloAgenteRepository,
    PrismaObrasRepository,
    ObrasService,
    AcaoDeAgenteGuard,
    ThrottlerPorAgenteGuard,
    ArmazenamentoDeDocumentos,
    TermoDaOrdemPdf,
    { provide: RELOGIO_DA_ENGENHARIA, useValue: () => new Date() },
  ],
})
export class EngenhariaModule {}
