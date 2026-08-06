/**
 * Single BullMQ queue for OS-owned jobs (ADR-0007/0011). New jobs (e.g. the
 * Bitrix read-only import) run here; legacy crons stay read-only inventory and
 * never enter this queue.
 */
export const JOBS_QUEUE_NAME = "plugga-jobs";
