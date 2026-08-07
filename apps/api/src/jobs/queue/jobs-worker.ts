import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";

import { JobHandlerRegistry } from "./job-handler-registry";
import type { JobEnvelope } from "./job-handler";
import { JobRunsRecorder } from "./job-runs-recorder";
import { JOBS_QUEUE_NAME } from "./jobs-queue.constants";

/** Minimal shape of a BullMQ job the dispatcher needs (also used by tests). */
export interface DispatchableJob {
  name: string;
  data: JobEnvelope;
  attemptsMade: number;
}

/**
 * Consumer side of the queue. Started only when JOBS_ENABLED is set, so the API
 * and unit tests boot without Redis. Each job is dispatched to its registered
 * handler and wrapped in the job_runs lifecycle by the recorder.
 */
@Injectable()
export class JobsWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JobsWorker.name);
  private worker: Worker | null = null;
  private connection: Redis | null = null;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(JobHandlerRegistry) private readonly registry: JobHandlerRegistry,
    @Inject(JobRunsRecorder) private readonly recorder: JobRunsRecorder,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get<boolean>("JOBS_ENABLED", false)) {
      this.logger.log("jobs worker disabled (JOBS_ENABLED=false)");
      return;
    }

    const redisUrl = this.config.get<string>("REDIS_URL", "redis://localhost:6379");
    const concurrency = this.config.get<number>("JOBS_WORKER_CONCURRENCY", 1);
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.worker = new Worker(JOBS_QUEUE_NAME, (job) => this.dispatch(job), {
      connection: this.connection,
      concurrency,
    });
    this.worker.on("failed", (job, error) => {
      this.logger.warn(`job='${job?.name}' attempt failed: ${error.message}`);
    });
    this.logger.log(`jobs worker started (concurrency=${concurrency})`);
  }

  async dispatch(job: DispatchableJob): Promise<void> {
    const handler = this.registry.get(job.name);
    if (!handler) {
      throw new Error(`no handler registered for job '${job.name}'`);
    }

    const attempt = job.attemptsMade + 1;
    await this.recorder.run(
      {
        jobKey: job.name,
        integrationKey: handler.integrationKey ?? null,
        attempt,
        triggeredBy: job.data.meta.triggeredBy,
      },
      async ({ jobRunId }) => {
        const result = await handler.process(job.data.payload, {
          jobKey: job.name,
          attempt,
          jobRunId,
        });
        return { logRef: result?.logRef, skipped: result?.skipped };
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
