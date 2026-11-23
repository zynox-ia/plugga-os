import { Inject, Injectable } from "@nestjs/common";
import { semanaDe } from "@plugga/shared";

import { diaEmManaus } from "../compras/dias-uteis";
import type { JobHandler, JobResult } from "../jobs/queue/job-handler";
import type { AgendamentoDiario } from "../jobs/queue/jobs-queue.port";
import { PrismaJobsService } from "../prisma/prisma-jobs.service";
import { gerarOcorrencias } from "./geracao-de-ocorrencias";

export const GERAR_OCORRENCIAS_JOB_KEY = "tarefas.gerar_ocorrencias_do_dia";

/** Todo dia às 08:00 de Manaus, como o robô do Bitrix criava as tarefas do dia. */
export const AGENDAMENTO_DA_GERACAO: AgendamentoDiario = { id: "tarefas-geracao-diaria", horario: "08:00", fuso: "America/Manaus" };

export type Relogio = () => Date;
export const RELOGIO_DO_AGENDADOR = Symbol("RELOGIO_DO_AGENDADOR");

/**
 * O agendador das Tarefas (PLU-349, PLU-340): gera as ocorrências de todos os
 * departamentos até o fim da semana, no papel de jobs. A leitura também gera o
 * que faltar, então um dia sem o agendador (Redis fora, JOBS_ENABLED desligado)
 * não perde ocorrência; o agendador deixa o dia pronto antes de alguém abrir a tela.
 */
@Injectable()
export class GerarOcorrenciasDoDiaHandler implements JobHandler {
  readonly jobKey = GERAR_OCORRENCIAS_JOB_KEY;

  constructor(
    @Inject(PrismaJobsService) private readonly prisma: PrismaJobsService,
    @Inject(RELOGIO_DO_AGENDADOR) private readonly agora: Relogio,
  ) {}

  async process(): Promise<JobResult> {
    const hoje = diaEmManaus(this.agora());
    const ate = semanaDe(hoje).fim;
    const criadas = await this.prisma.$transaction((tx) => gerarOcorrencias(tx, ate));
    return { logRef: `os://tarefas/ocorrencias hoje=${hoje} ate=${ate} criadas=${criadas}` };
  }
}
