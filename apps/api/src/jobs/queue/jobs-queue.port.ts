export interface EnqueueOptions {
  /**
   * Idempotency key mapped to the BullMQ job id. A second enqueue with the same
   * key does not create a duplicate while the job is waiting/active.
   */
  dedupeKey?: string;
  /** Max attempts before the job is considered failed (default 3). */
  attempts?: number;
  /** Base delay for exponential backoff between retries, ms (default 5000). */
  backoffMs?: number;
  /** Delay before the job becomes eligible to run, ms. */
  delayMs?: number;
  /** Who requested the job; recorded on job_runs.triggered_by. */
  triggeredBy?: string;
}

export interface EnqueueResult {
  jobId: string;
  jobKey: string;
  /** True when an existing job with the same dedupeKey was already queued. */
  deduped: boolean;
}

/**
 * Producer port for OS-owned jobs. Consumers depend on this abstraction, never
 * on BullMQ directly, so the queue technology stays swappable and testable.
 */
export abstract class JobsQueue {
  abstract enqueue<Payload>(
    jobKey: string,
    payload: Payload,
    options?: EnqueueOptions,
  ): Promise<EnqueueResult>;
}
