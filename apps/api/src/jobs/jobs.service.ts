import { Inject, Injectable } from "@nestjs/common";
import { listJobRunsResponseSchema, type ListJobRunsResponse } from "@plugga/shared";

import { JobsRepository } from "./jobs.repository";

@Injectable()
export class JobsService {
  constructor(@Inject(JobsRepository) private readonly repository: JobsRepository) {}

  async list(): Promise<ListJobRunsResponse> {
    const runs = await this.repository.findRuns();

    return listJobRunsResponseSchema.parse({
      inventoryOnly: true,
      items: runs.map((run) => ({
        id: run.id,
        jobKey: run.jobKey,
        integrationKey: run.integration?.key ?? null,
        scheduledFor: run.scheduledFor?.toISOString() ?? null,
        startedAt: run.startedAt?.toISOString() ?? null,
        finishedAt: run.finishedAt?.toISOString() ?? null,
        status: run.status,
        attempt: run.attempt,
        durationMs: run.durationMs,
        error: run.error,
        triggeredBy: run.triggeredBy,
        logRef: run.logRef,
        createdAt: run.createdAt.toISOString(),
      })),
    });
  }
}
