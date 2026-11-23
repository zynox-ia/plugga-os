import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

import type { JobEnvelope } from "./job-handler";
import { JOBS_QUEUE_NAME } from "./jobs-queue.constants";
import { JobsQueue, cronDiario, intervaloValido, type AgendamentoDiario, type AgendamentoPeriodico, type EnqueueOptions, type EnqueueResult } from "./jobs-queue.port";

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 5_000;

/**
 * BullMQ-backed producer. Owns its Redis connection and queue and closes both on
 * shutdown. Only instantiated when JOBS_ENABLED is set (see the module factory).
 */
@Injectable()
export class BullJobsQueue extends JobsQueue implements OnModuleDestroy {
  private readonly logger = new Logger(BullJobsQueue.name);
  private readonly connection: Redis;
  private readonly queue: Queue;

  constructor(redisUrl: string) {
    super();
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue(JOBS_QUEUE_NAME, { connection: this.connection });
  }

  async enqueue<Payload>(
    jobKey: string,
    payload: Payload,
    options: EnqueueOptions = {},
  ): Promise<EnqueueResult> {
    const envelope: JobEnvelope<Payload> = {
      payload,
      meta: { triggeredBy: options.triggeredBy ?? "system" },
    };

    // Deduplicação nativa, não `jobId`: mapear a chave para o id do job faria
    // um job concluído/falhado RETIDO (removeOnComplete/removeOnFail) engolir
    // qualquer enqueue futuro com a mesma chave — o add viraria no-op para
    // sempre, sem erro. A chave nativa expira quando o job termina, que é o
    // contrato da porta ("while the job is waiting/active").
    let deduped = false;
    if (options.dedupeKey) {
      deduped = (await this.queue.getDeduplicationJobId(options.dedupeKey)) != null;
    }

    const job = await this.queue.add(jobKey, envelope, {
      ...(options.dedupeKey ? { deduplication: { id: options.dedupeKey } } : {}),
      attempts: options.attempts ?? DEFAULT_ATTEMPTS,
      backoff: { type: "exponential", delay: options.backoffMs ?? DEFAULT_BACKOFF_MS },
      delay: options.delayMs,
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 5_000 },
    });

    this.logger.log(
      `enqueued job='${jobKey}' id='${String(job.id)}'${deduped ? " (deduped)" : ""}`,
    );
    return { jobId: String(job.id), jobKey, deduped };
  }

  /** Agendador do BullMQ (upsert): reiniciar a API não duplica o job do dia. */
  override async agendarDiario<Payload>(jobKey: string, payload: Payload, agendamento: AgendamentoDiario): Promise<{ agendado: boolean }> {
    const envelope: JobEnvelope<Payload> = { payload, meta: { triggeredBy: `agendador:${agendamento.id}` } };
    await this.queue.upsertJobScheduler(
      agendamento.id,
      { pattern: cronDiario(agendamento.horario), tz: agendamento.fuso },
      {
        name: jobKey,
        data: envelope,
        opts: { attempts: DEFAULT_ATTEMPTS, backoff: { type: "exponential", delay: DEFAULT_BACKOFF_MS }, removeOnComplete: { count: 1_000 }, removeOnFail: { count: 5_000 } },
      },
    );
    this.logger.log(`scheduled job='${jobKey}' daily at ${agendamento.horario} ${agendamento.fuso} id='${agendamento.id}'`);
    return { agendado: true };
  }

  /** Agendador do BullMQ a cada intervalo (upsert pelo id): reiniciar a API não duplica. */
  override async agendarACada<Payload>(jobKey: string, payload: Payload, agendamento: AgendamentoPeriodico): Promise<{ agendado: boolean }> {
    const envelope: JobEnvelope<Payload> = { payload, meta: { triggeredBy: `agendador:${agendamento.id}` } };
    await this.queue.upsertJobScheduler(
      agendamento.id,
      { every: intervaloValido(agendamento.intervaloMs) },
      {
        name: jobKey,
        data: envelope,
        opts: { attempts: DEFAULT_ATTEMPTS, backoff: { type: "exponential", delay: DEFAULT_BACKOFF_MS }, removeOnComplete: { count: 1_000 }, removeOnFail: { count: 5_000 } },
      },
    );
    this.logger.log(`scheduled job='${jobKey}' every ${agendamento.intervaloMs} ms id='${agendamento.id}'`);
    return { agendado: true };
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
