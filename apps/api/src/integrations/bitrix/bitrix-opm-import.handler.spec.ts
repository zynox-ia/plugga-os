import { describe, expect, it } from "vitest";

import type { ImportSummary } from "./bitrix-import.service";
import { BitrixImportService } from "./bitrix-import.service";
import { BitrixOpmImportHandler } from "./bitrix-opm-import.handler";
import {
  BITRIX_INTEGRATION_KEY,
  BITRIX_OPM_DOMAIN,
  BITRIX_OPM_IMPORT_JOB_KEY,
} from "./bitrix.constants";

function buildHandler(summary: Partial<ImportSummary> = {}) {
  const calls: number[] = [];
  const importService = {
    async importOpm(): Promise<ImportSummary> {
      calls.push(1);
      return {
        domain: BITRIX_OPM_DOMAIN,
        read: 3,
        created: 1,
        updated: 1,
        unchanged: 1,
        skipped: 0,
        truncated: false,
        ...summary,
      };
    },
  } as unknown as BitrixImportService;
  return { handler: new BitrixOpmImportHandler(importService), calls };
}

describe("BitrixOpmImportHandler", () => {
  it("registers under the OPM import job key and the bitrix integration", () => {
    const { handler } = buildHandler();

    expect(handler.jobKey).toBe(BITRIX_OPM_IMPORT_JOB_KEY);
    expect(handler.integrationKey).toBe(BITRIX_INTEGRATION_KEY);
  });

  it("runs the import and summarizes counts in a secret-free logRef", async () => {
    const { handler, calls } = buildHandler();

    const result = await handler.process();

    expect(calls).toHaveLength(1);
    expect(result.logRef).toBe(
      "os://bitrix/opm read=3 created=1 updated=1 unchanged=1 skipped=0 truncated=false",
    );
  });

  it("surfaces skipped and truncated runs in the logRef", async () => {
    const { handler } = buildHandler({ read: 5, skipped: 2, truncated: true });

    const result = await handler.process();

    expect(result.logRef).toContain("skipped=2");
    expect(result.logRef).toContain("truncated=true");
  });

  it("propagates a read failure so the job_run is recorded as failed", async () => {
    const importService = {
      async importOpm(): Promise<ImportSummary> {
        throw new Error("Bitrix read 'crm.item.list' failed: status=401");
      },
    } as unknown as BitrixImportService;

    await expect(new BitrixOpmImportHandler(importService).process()).rejects.toThrow(
      /status=401/,
    );
  });
});
