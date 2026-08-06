import { describe, expect, it } from "vitest";

import { JobsRepository, type StoredJobRunInventoryItem } from "./jobs.repository";
import { JobsService } from "./jobs.service";

class InMemoryJobsRepository extends JobsRepository {
  constructor(private readonly rows: StoredJobRunInventoryItem[]) {
    super();
  }

  async findRuns(): Promise<StoredJobRunInventoryItem[]> {
    return this.rows;
  }
}

describe("JobsService", () => {
  it("marks the job-run response as inventory-only", async () => {
    const service = new JobsService(
      new InMemoryJobsRepository([
        {
          id: "00000000-0000-4000-8000-000000000302",
          jobKey: "inventory.bitrix-sync",
          integration: { key: "bitrix" },
          scheduledFor: new Date("2026-08-06T12:00:00.000Z"),
          startedAt: null,
          finishedAt: null,
          status: "skipped",
          attempt: 1,
          durationMs: null,
          error: null,
          triggeredBy: "seed:inventory-only",
          logRef: "mock://job-runs/inventory-bitrix-sync",
          createdAt: new Date("2026-08-06T15:00:00.000Z"),
        },
      ]),
    );

    const response = await service.list();

    expect(response.inventoryOnly).toBe(true);
    expect(response.items).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000302",
        jobKey: "inventory.bitrix-sync",
        integrationKey: "bitrix",
        scheduledFor: "2026-08-06T12:00:00.000Z",
        startedAt: null,
        finishedAt: null,
        status: "skipped",
        attempt: 1,
        durationMs: null,
        error: null,
        triggeredBy: "seed:inventory-only",
        logRef: "mock://job-runs/inventory-bitrix-sync",
        createdAt: "2026-08-06T15:00:00.000Z",
      },
    ]);
  });
});
