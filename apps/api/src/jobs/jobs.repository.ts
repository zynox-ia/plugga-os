import type { JobRunStatus } from "@plugga/shared";

export interface StoredJobRunInventoryItem {
  id: string;
  jobKey: string;
  integration: { key: string } | null;
  scheduledFor: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  status: JobRunStatus;
  attempt: number;
  durationMs: number | null;
  error: string | null;
  triggeredBy: string;
  logRef: string | null;
  createdAt: Date;
}

export abstract class JobsRepository {
  abstract findRuns(): Promise<StoredJobRunInventoryItem[]>;
}
