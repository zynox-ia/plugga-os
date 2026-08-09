import { Inject, Injectable, Logger } from "@nestjs/common";

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
  /** Handler refused the work by its own gate: record `skipped`, not `success`. */
  skipped?: boolean;
}

/**
 * Wraps a job execution with its job_runs lifecycle: a `running` row on entry,
 * then `success`, `skipped` or `failed` with duration on exit. On failure it
 * records the (truncated) error and rethrows, so BullMQ can apply its retry
 * policy.
 */
@Injectable()
export class JobRunsRecorder {
  private readonly logger = new Logger(JobRunsRecorder.name);

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
      // Contabilidade não pode ressuscitar trabalho feito: se este finishRun
      // falhar e a rejeição subir, o BullMQ reexecuta um job que já concluiu.
      // A linha fica presa em `running`, o que é o mal menor — vira log.
      await this.finishQuietly(id, {
        status: outcome?.skipped ? "skipped" : "success",
        finishedAt: new Date(),
        durationMs: Date.now() - startedMs,
        logRef: outcome?.logRef ?? null,
      });
    } catch (error) {
      // Mesmo raciocínio no caminho de falha: um erro do banco aqui não pode
      // substituir o erro real do handler — é ele que o BullMQ deve registrar.
      await this.finishQuietly(id, {
        status: "failed",
        finishedAt: new Date(),
        durationMs: Date.now() - startedMs,
        error: toErrorMessage(error),
      });
      throw error;
    }
  }

  private async finishQuietly(
    id: string,
    outcome: Parameters<JobRunsRepository["finishRun"]>[1],
  ): Promise<void> {
    try {
      await this.repository.finishRun(id, outcome);
    } catch (falha) {
      this.logger.error(
        `job_run ${id} não finalizado (${outcome.status}): ${falha instanceof Error ? falha.message : String(falha)}`,
      );
    }
  }
}

function toErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}
