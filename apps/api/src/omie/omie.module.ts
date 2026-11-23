import { Inject, Logger, Module, type OnModuleInit } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { FinanceiroHabilitadoGuard } from "../financeiro/financeiro-habilitado.guard";
import { PrismaSegredoRepository } from "../llm/prisma-segredo.repository.js";
import { SegredoRepository } from "../llm/segredo.repository.js";
import { IntegrationsModule } from "../integrations/integrations.module";
import { JobHandlerRegistry } from "../jobs/queue/job-handler-registry";
import { JobsQueueModule } from "../jobs/queue/jobs-queue.module";
import { JobsQueue } from "../jobs/queue/jobs-queue.port";
import { PrismaModule } from "../prisma/prisma.module";
import { OmieEscrita, OmieEscritaPorModo } from "./omie-escrita";
import { OmieDespacharHandler, OmieEnviarHandler } from "./omie-fila.handlers";
import { AGENDAMENTO_DO_DESPACHO, OMIE_DESPACHAR_JOB, OmieFilaService } from "./omie-fila.service";
import { OmieCofreService, OmieLeitura } from "./omie-cofre.service";
import { OmieConexoesService, OmieLeituraPorEmpresa } from "./omie-conexoes.service";
import { OmieEmpresasController } from "./omie-empresas.controller";
import { OmieController } from "./omie.controller";
import { OmieDubleAdapter } from "./omie-duble.adapter";
import { OmieHttpAdapter } from "./omie-http.adapter";
import { OmiePorModoAdapter } from "./omie-por-modo.adapter";
import { OmiePort } from "./omie.port";
import { PrismaOmieConexoesRepository } from "./prisma-omie-conexoes.repository";
import { PrismaOmieLeituraPorEmpresa } from "./prisma-omie-leitura-por-empresa.repository";
import { PrismaOmieLeitura } from "./prisma-omie-leitura.repository";

/** OMIE: a conta única antiga (OmieCofreService) e as conexões por empresa (PLU-342), exportadas para o Financeiro. */
@Module({
  imports: [AuditModule, CoreModule, IntegrationsModule, JobsQueueModule, PrismaModule],
  controllers: [OmieController, OmieEmpresasController],
  providers: [
    FinanceiroHabilitadoGuard,
    OmieCofreService,
    OmieConexoesService,
    PrismaOmieConexoesRepository,
    { provide: OmieLeituraPorEmpresa, useClass: PrismaOmieLeituraPorEmpresa },
    OmieHttpAdapter,
    OmieDubleAdapter,
    // Pelo modo da integração: mock só dublê; read_only lê; write lê e escreve.
    { provide: OmiePort, useClass: OmiePorModoAdapter },
    { provide: OmieLeitura, useClass: PrismaOmieLeitura },
    { provide: SegredoRepository, useClass: PrismaSegredoRepository },
    // Fila do OMIE (PLU-342): a escrita real só depois do Aplicativo Teste (D7).
    { provide: OmieEscrita, useClass: OmieEscritaPorModo },
    OmieFilaService,
    OmieDespacharHandler,
    OmieEnviarHandler,
  ],
  exports: [OmieCofreService, OmieConexoesService],
})
export class OmieModule implements OnModuleInit {
  private readonly logger = new Logger(OmieModule.name);

  constructor(
    @Inject(JobHandlerRegistry) private readonly registry: JobHandlerRegistry,
    @Inject(JobsQueue) private readonly fila: JobsQueue,
    @Inject(OmieDespacharHandler) private readonly despachar: OmieDespacharHandler,
    @Inject(OmieEnviarHandler) private readonly enviar: OmieEnviarHandler,
  ) {}

  /**
   * Registra os handlers da fila e agenda o despacho a cada 30 minutos. O agendamento
   * não segura a subida da API: com o Redis fora, só fica no log. Fora do modo `write`,
   * cada despacho só registra `skipped` e não chama o OMIE.
   */
  onModuleInit(): void {
    this.registry.register(this.despachar);
    this.registry.register(this.enviar);
    void this.fila.agendarACada(OMIE_DESPACHAR_JOB, {}, AGENDAMENTO_DO_DESPACHO).catch((erro: unknown) => {
      this.logger.warn(`agendamento do despacho do OMIE falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
    });
  }
}
