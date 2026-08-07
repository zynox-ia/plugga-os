import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaModule } from "../../prisma/prisma.module";
import { BullJobsQueue } from "./bull-jobs-queue";
import { DisabledJobsQueue } from "./disabled-jobs-queue";
import { JobHandlerRegistry } from "./job-handler-registry";
import { JobRunsRecorder } from "./job-runs-recorder";
import { JobRunsRepository } from "./job-runs.repository";
import { JobsQueue } from "./jobs-queue.port";
import { JobsWorker } from "./jobs-worker";
import { PrismaJobRunsRepository } from "./prisma-job-runs.repository";

/**
 * BullMQ + Redis foundation for OS-owned jobs (ADR-0007/0011). Provides the
 * producer port, the gated worker, and the job_runs lifecycle recorder. Feature
 * modules import this to enqueue jobs and register handlers. Legacy cron
 * inventory (JobsModule) is untouched and stays read-only.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    { provide: JobRunsRepository, useClass: PrismaJobRunsRepository },
    JobRunsRecorder,
    JobHandlerRegistry,
    JobsWorker,
    {
      // Producer selection: real BullMQ queue when enabled, otherwise a safe
      // disabled queue that fails loudly instead of dropping jobs.
      provide: JobsQueue,
      useFactory: (config: ConfigService): JobsQueue =>
        config.get<boolean>("JOBS_ENABLED", false)
          ? new BullJobsQueue(config.get<string>("REDIS_URL", "redis://localhost:6379"))
          : new DisabledJobsQueue(),
      inject: [ConfigService],
    },
  ],
  exports: [JobsQueue, JobHandlerRegistry, JobRunsRecorder],
})
export class JobsQueueModule {}
