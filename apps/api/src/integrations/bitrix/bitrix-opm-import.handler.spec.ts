import { describe, expect, it } from "vitest";

import type { ImportOutcome, ImportSummary } from "./bitrix-import.service";
import { BitrixImportService } from "./bitrix-import.service";
import { BitrixOpmImportHandler } from "./bitrix-opm-import.handler";
import {
  BITRIX_INTEGRATION_KEY,
  BITRIX_OPM_DOMAIN,
  BITRIX_OPM_IMPORT_JOB_KEY,
} from "./bitrix.constants";

function summaryOutcome(overrides: Partial<ImportSummary> = {}): ImportOutcome {
  return {
    skipped: false,
    summary: {
      domain: BITRIX_OPM_DOMAIN,
      read: 3,
      created: 1,
      updated: 1,
      unchanged: 1,
      skipped: 0,
      truncated: false,
      ...overrides,
    },
  };
}

function buildHandler(outcome: ImportOutcome = summaryOutcome()) {
  let calls = 0;
  const importService = {
    async importOpm(): Promise<ImportOutcome> {
      calls += 1;
      return outcome;
    },
  } as unknown as BitrixImportService;
  return { handler: new BitrixOpmImportHandler(importService), calls: () => calls };
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

    expect(calls()).toBe(1);
    expect(result.skipped).toBeUndefined();
    expect(result.logRef).toBe(
      "os://bitrix/opm read=3 created=1 updated=1 unchanged=1 skipped=0 truncated=false",
    );
  });

  it("surfaces skipped and truncated runs in the logRef", async () => {
    const { handler } = buildHandler(summaryOutcome({ read: 5, skipped: 2, truncated: true }));

    const result = await handler.process();

    expect(result.logRef).toContain("skipped=2");
    expect(result.logRef).toContain("truncated=true");
  });

  it.each(["mode", "credential"] as const)(
    "records a skipped job_run (not success) when the gate refuses on %s",
    async (reason) => {
      const { handler } = buildHandler({ skipped: true, reason });

      const result = await handler.process();

      expect(result.skipped).toBe(true);
      expect(result.logRef).toBe(`os://bitrix/opm skipped reason=${reason}`);
    },
  );

  it("propagates a read failure so the job_run is recorded as failed", async () => {
    const importService = {
      async importOpm(): Promise<ImportOutcome> {
        throw new Error("Bitrix read 'crm.item.list' failed: status=401");
      },
    } as unknown as BitrixImportService;

    await expect(new BitrixOpmImportHandler(importService).process()).rejects.toThrow(
      /status=401/,
    );
  });
});
