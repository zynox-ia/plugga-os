/**
 * A job handler processes one job key. Handlers are registered by feature
 * modules (e.g. the Bitrix migrator) and dispatched by the worker. Handlers are
 * the only place that does the job's real work; the queue/worker/recorder around
 * them stay job-agnostic.
 */
export interface JobHandler<Payload = unknown> {
  /** Stable key identifying the job type (also the BullMQ job name). */
  readonly jobKey: string;
  /** Optional integration this job belongs to; links its job_runs rows. */
  readonly integrationKey?: string;
  process(payload: Payload, context: JobContext): Promise<JobResult | void>;
}

export interface JobContext {
  jobKey: string;
  /** 1-based attempt number for this execution. */
  attempt: number;
  /** Id of the job_runs row recording this execution. */
  jobRunId: string;
}

export interface JobResult {
  /** Optional pointer for observability (never a secret/token — ADR-0007). */
  logRef?: string;
}

/**
 * Internal envelope stored as BullMQ job data: the handler payload plus metadata
 * that must not pollute the handler's own payload shape.
 */
export interface JobEnvelope<Payload = unknown> {
  payload: Payload;
  meta: { triggeredBy: string };
}
