import { JobsQueue, type EnqueueResult } from "./jobs-queue.port";

/**
 * Safe default when JOBS_ENABLED is off. Enqueue fails loudly rather than
 * silently dropping work, so a misconfigured environment is obvious instead of
 * quietly losing jobs.
 */
export class DisabledJobsQueue extends JobsQueue {
  async enqueue(): Promise<EnqueueResult> {
    throw new Error(
      "jobs queue is disabled; set JOBS_ENABLED=true with a reachable REDIS_URL to enqueue jobs",
    );
  }
}
