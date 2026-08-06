import { Inject, Injectable } from "@nestjs/common";

import { JobRunsRepository } from "./job-runs.repository";

const MAX_ERROR_LENGTH = 2_000;

export interface JobRunMeta {
  jobKey: string;
  integrationKey?: string | null;
  attempt: number;
  triggeredBy: string;
}

export interface JobRunExecutionContext {
  jobRunId: string;
}

export interface JobRunOutcome {
  logRef?: string;
}

/**
 * Wraps a job execution with its job_runs lifecycle: a `running` row on entry,
 * then `success` or `failed` with duration on exit. On failure it records the
 * (truncated) error and rethrows, so BullMQ can apply its retry policy.
 */
@Injectable()
export class JobRunsRecorder {
  constructor(@Inject(JobRunsRepository) private readonly repository: JobRunsRepository) {}

  async run(
    meta: JobRunMeta,
    execute: (context: JobRunExecutionContext) => Promise<JobRunOutcome | void>,
  ): Promise<void> {
    const startedAt = new Date();
    const startedMs = Date.now();
    const id = await this.repository.startRun({
      jobKey: meta.jobKey,
      integrationKey: meta.integrationKey ?? null,
      attempt: meta.attempt,
      triggeredBy: meta.triggeredBy,
      startedAt,
    });

    try {
      const outcome = await execute({ jobRunId: id });
      await this.repository.finishRun(id, {
        status: "success",
        finishedAt: new Date(),
        durationMs: Date.now() - startedMs,
        logRef: outcome?.logRef ?? null,
      });
    } catch (error) {
      await this.repository.finishRun(id, {
        status: "failed",
        finishedAt: new Date(),
        durationMs: Date.now() - startedMs,
        error: toErrorMessage(error),
      });
      throw error;
    }
  }
}

function toErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}
