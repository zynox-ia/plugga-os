export interface StartJobRunData {
  jobKey: string;
  /** Integration to associate; resolved to an id by the implementation. */
  integrationKey?: string | null;
  attempt: number;
  triggeredBy: string;
  startedAt: Date;
}

export interface FinishJobRunData {
  status: "success" | "failed";
  finishedAt: Date;
  durationMs: number;
  error?: string | null;
  logRef?: string | null;
}

/**
 * Write side of job_runs — the observability sink for job executions
 * (ADR-0007/0009). Separate from the read-only inventory repository.
 */
export abstract class JobRunsRepository {
  /** Creates a `running` row and returns its id. */
  abstract startRun(data: StartJobRunData): Promise<string>;
  /** Marks the row `success`/`failed` with duration and optional error/logRef. */
  abstract finishRun(id: string, data: FinishJobRunData): Promise<void>;
}
