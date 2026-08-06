import { describe, expect, it } from "vitest";

import {
  IntegrationsRepository,
  type StoredIntegrationSummary,
} from "./integrations.repository";
import { IntegrationsService } from "./integrations.service";

class InMemoryIntegrationsRepository extends IntegrationsRepository {
  constructor(private readonly rows: StoredIntegrationSummary[]) {
    super();
  }

  async findAll(): Promise<StoredIntegrationSummary[]> {
    return this.rows;
  }
}

describe("IntegrationsService", () => {
  it("returns only the framework-free integration metadata contract", async () => {
    const service = new IntegrationsService(
      new InMemoryIntegrationsRepository([
        {
          id: "00000000-0000-4000-8000-000000000301",
          key: "bitrix",
          name: "Bitrix",
          mode: "mock",
          status: "unknown",
          lastSyncAt: null,
          lastError: null,
          owner: "Operações",
          updatedAt: new Date("2026-08-06T15:00:00.000Z"),
        },
      ]),
    );

    await expect(service.list()).resolves.toEqual({
      items: [
        {
          id: "00000000-0000-4000-8000-000000000301",
          key: "bitrix",
          name: "Bitrix",
          mode: "mock",
          status: "unknown",
          lastSyncAt: null,
          lastError: null,
          owner: "Operações",
          updatedAt: "2026-08-06T15:00:00.000Z",
        },
      ],
    });
  });
});
