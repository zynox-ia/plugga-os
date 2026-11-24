import { Inject, Logger, Module, type OnModuleInit } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { CoreModule } from "../core/core.module";
import { JobHandlerRegistry } from "../jobs/queue/job-handler-registry";
import { JobsQueue } from "../jobs/queue/jobs-queue.port";
import { JobsQueueModule } from "../jobs/queue/jobs-queue.module";
import { ArmazenamentoDeDocumentos } from "../lead-documentos/armazenamento-de-documentos";
import { PrismaModule } from "../prisma/prisma.module";
import { AGENDAMENTO_DA_GERACAO, GERAR_OCORRENCIAS_JOB_KEY, GerarOcorrenciasDoDiaHandler, RELOGIO_DO_AGENDADOR } from "./gerar-ocorrencias-do-dia.handler";
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
  imports: [AuditModule, CoreModule, PrismaModule, JobsQueueModule],
  controllers: [TarefasController],
  providers: [
    PortaoDoDepartamentoGuard,
    TarefasService,
    PrismaTarefasRepository,
    ArmazenamentoDeDocumentos,
    { provide: RELOGIO_DAS_TAREFAS, useValue: () => new Date() },
    GerarOcorrenciasDoDiaHandler,
    { provide: RELOGIO_DO_AGENDADOR, useValue: () => new Date() },
  ],
  exports: [TarefasService],
})
export class TarefasModule implements OnModuleInit {
  private readonly logger = new Logger(TarefasModule.name);

  constructor(
    @Inject(JobHandlerRegistry) private readonly registry: JobHandlerRegistry,
    @Inject(JobsQueue) private readonly fila: JobsQueue,
    @Inject(GerarOcorrenciasDoDiaHandler) private readonly geracao: GerarOcorrenciasDoDiaHandler,
  ) {}

  /**
   * Registra o handler e agenda a geração das 08h. O agendamento não segura a
   * subida da API: com o Redis fora, só fica no log, e a leitura gera o que faltar.
   */
  onModuleInit(): void {
    this.registry.register(this.geracao);
    void this.fila.agendarDiario(GERAR_OCORRENCIAS_JOB_KEY, {}, AGENDAMENTO_DA_GERACAO).catch((erro: unknown) => {
      this.logger.warn(`agendamento da geração das tarefas falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
    });
  }
}
