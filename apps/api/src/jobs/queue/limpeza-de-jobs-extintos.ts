import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";

import { JobsQueue } from "./jobs-queue.port";

/**
 * O que ficou no Redis de jobs que não existem mais. A integração com o OMIE foi extinta
 * (decisão do André de 24/11/2026): o agendamento do despacho (`omie-despacho`, a cada 30 min)
 * e os jobs `omie.*` na fila não têm mais quem os rode. Sem a limpeza, o worker falharia a
 * cada meia hora com "no handler registered".
 */
export const JOBS_EXTINTOS = {
  agendamentos: ["omie-despacho"],
  jobKeys: ["omie.despachar", "omie.enviar"],
} as const;

/**
 * Limpa no boot, sem passo manual em produção. Idempotente: sem o que limpar, nada muda. Não
 * segura a subida da API: com o Redis fora, fica só no log e tenta de novo na próxima subida.
 */
@Injectable()
export class LimpezaDeJobsExtintos implements OnApplicationBootstrap {
  private readonly logger = new Logger(LimpezaDeJobsExtintos.name);

  constructor(@Inject(JobsQueue) private readonly fila: JobsQueue) {}

  onApplicationBootstrap(): void {
    void this.limpar().catch((erro: unknown) => {
      this.logger.warn(`limpeza dos jobs extintos falhou: ${erro instanceof Error ? erro.message : String(erro)}`);
    });
  }

  async limpar(): Promise<{ agendamentosRemovidos: number; descartados: number }> {
    let agendamentosRemovidos = 0;
    for (const id of JOBS_EXTINTOS.agendamentos) {
      if ((await this.fila.removerAgendamento(id)).removido) agendamentosRemovidos += 1;
    }
    const { descartados } = await this.fila.descartarPendentes(JOBS_EXTINTOS.jobKeys);
    return { agendamentosRemovidos, descartados };
  }
}
