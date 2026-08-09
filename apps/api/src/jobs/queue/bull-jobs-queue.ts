import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

import type { JobEnvelope } from "./job-handler";
import { JOBS_QUEUE_NAME } from "./jobs-queue.constants";
import { JobsQueue, type EnqueueOptions, type EnqueueResult } from "./jobs-queue.port";

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

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await this.connection.quit();
  }
}
