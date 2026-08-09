import type { ConfigService } from "@nestjs/config";
import type { IntegrationMode } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { BitrixImportService, type ImportSummary } from "./bitrix-import.service";
import { BITRIX_MAX_PAGES } from "./bitrix.constants";
import {
  BitrixReadClient,
  type BitrixListParams,
  type BitrixListResponse,
} from "./bitrix-read.client";
import {
  BitrixRepository,
  type MirrorRecordInput,
  type MirrorUpsertOutcome,
  type SyncOutcome,
} from "./bitrix.repository";

interface RecordedCall {
  method: string;
  params: BitrixListParams;
  start: number;
}

class StubReadClient extends BitrixReadClient {
  readonly calls: RecordedCall[] = [];

  constructor(private readonly pages: BitrixListResponse[]) {
    super();
  }

  async callList(
    method: string,
    params: BitrixListParams,
    start: number,
  ): Promise<BitrixListResponse> {
    this.calls.push({ method, params, start });
    return this.pages[this.calls.length - 1] ?? { result: [] };
  }
}

/** Mirrors the real fingerprint semantics: unchanged payload => no write. */
class InMemoryBitrixRepository extends BitrixRepository {
  readonly rows = new Map<string, MirrorRecordInput>();
  readonly writes: MirrorUpsertOutcome[] = [];
  readonly syncOutcomes: SyncOutcome[] = [];

  constructor(private readonly mode: IntegrationMode | null = "read_only") {
    super();
  }

  async getIntegrationMode(): Promise<IntegrationMode | null> {
    return this.mode;
  }

  async upsertMirrorRecord(input: MirrorRecordInput): Promise<MirrorUpsertOutcome> {
    const key = `${input.domain}:${input.externalId}`;
    const existing = this.rows.get(key);
    let outcome: MirrorUpsertOutcome;
    if (!existing) {
      outcome = "created";
    } else if (existing.sourceFingerprint === input.sourceFingerprint) {
      outcome = "unchanged";
    } else {
      outcome = "updated";
    }
    if (outcome !== "unchanged") {
      this.rows.set(key, input);
    }
    this.writes.push(outcome);
    return outcome;
  }

  async recordSyncOutcome(outcome: SyncOutcome): Promise<void> {
    this.syncOutcomes.push(outcome);
  }
}

/** Literal stub: a real ConfigService falls back to process.env. */
function configStub(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string, defaultValue?: unknown): unknown =>
      key in values ? values[key] : defaultValue,
  } as unknown as ConfigService;
}

const CREDENTIAL = {
  BITRIX_WEBHOOK_URL: "https://portal.example.com/rest/1/token",
  BITRIX_OPM_ENTITY_TYPE_ID: 1032,
};

function buildService(
  pages: BitrixListResponse[],
  options: {
    environment?: Record<string, unknown>;
    mode?: IntegrationMode | null;
  } = {},
) {
  const client = new StubReadClient(pages);
  // `in`, not `??`: an explicit `mode: null` must not fall back to read_only.
  const repository = new InMemoryBitrixRepository(
    "mode" in options ? options.mode! : "read_only",
  );
  const config = configStub({ ...CREDENTIAL, ...options.environment });
  return { service: new BitrixImportService(client, repository, config), client, repository };
}

/** Unwraps a run that is expected to have actually imported. */
function expectImported(outcome: Awaited<ReturnType<BitrixImportService["importOpm"]>>) {
  if (outcome.skipped) {
    throw new Error(`expected an import, got skipped (${outcome.reason})`);
  }
  return outcome.summary satisfies ImportSummary;
}

describe("BitrixImportService gate", () => {
  it("skips without reading Bitrix while the integration is in mock mode", async () => {
    const { service, client } = buildService([{ result: [{ id: 1 }] }], { mode: "mock" });

    await expect(service.importOpm()).resolves.toEqual({ skipped: true, reason: "mode" });
    expect(client.calls).toHaveLength(0);
  });

  it("skips without reading Bitrix when the integration row is missing", async () => {
    const { service, client } = buildService([{ result: [{ id: 1 }] }], { mode: null });

    await expect(service.importOpm()).resolves.toEqual({ skipped: true, reason: "mode" });
    expect(client.calls).toHaveLength(0);
  });

  it("skips without reading Bitrix when the credential is absent", async () => {
    const { service, client } = buildService([{ result: [{ id: 1 }] }], {
      environment: { BITRIX_WEBHOOK_URL: undefined },
    });

    await expect(service.importOpm()).resolves.toEqual({
      skipped: true,
      reason: "credential",
    });
    expect(client.calls).toHaveLength(0);
  });

  it("skips without reading Bitrix when the OPM entity type is absent", async () => {
    const { service, client } = buildService([{ result: [{ id: 1 }] }], {
      environment: { BITRIX_OPM_ENTITY_TYPE_ID: undefined },
    });

    await expect(service.importOpm()).resolves.toEqual({
      skipped: true,
      reason: "credential",
    });
    expect(client.calls).toHaveLength(0);
  });

  it("reports the gate decision for synchronous callers", async () => {
    await expect(buildService([], { mode: "mock" }).service.evaluateGate()).resolves.toEqual({
      allowed: false,
      reason: "mode",
      mode: "mock",
    });
    await expect(
      buildService([], { environment: { BITRIX_WEBHOOK_URL: undefined } }).service.evaluateGate(),
    ).resolves.toEqual({ allowed: false, reason: "credential" });
    await expect(buildService([]).service.evaluateGate()).resolves.toEqual({
      allowed: true,
      entityTypeId: 1032,
    });
  });
});

describe("BitrixImportService.importOpm", () => {
  it("reads the OPM domain with a read-only list method and the configured page size", async () => {
    const { service, client } = buildService([{ result: [{ id: 1 }] }], {
      environment: { BITRIX_IMPORT_PAGE_SIZE: 25 },
    });

    const summary = expectImported(await service.importOpm());

    expect(client.calls).toEqual([
      { method: "crm.item.list", params: { entityTypeId: 1032, limit: 25 }, start: 0 },
    ]);
    expect(summary).toMatchObject({ domain: "opm", read: 1, created: 1, truncated: false });
  });

  it("follows pagination until Bitrix stops returning a next offset", async () => {
    const { service, client, repository } = buildService([
      { result: [{ id: 1 }, { id: 2 }], next: 2 },
      { result: [{ id: 3 }], next: 3 },
      { result: [{ id: 4 }] },
    ]);

    const summary = expectImported(await service.importOpm());

    expect(client.calls.map((call) => call.start)).toEqual([0, 2, 3]);
    expect(summary).toMatchObject({ read: 4, created: 4, updated: 0, unchanged: 0 });
    expect(repository.rows.size).toBe(4);
    expect(summary.truncated).toBe(false);
  });

  it("is idempotent: re-importing identical data writes nothing", async () => {
    const page = { result: [{ id: 1, title: "OPM-1" }, { id: 2, title: "OPM-2" }] };
    const { service, repository } = buildService([page, page]);

    expect(expectImported(await service.importOpm())).toMatchObject({
      read: 2,
      created: 2,
      updated: 0,
      unchanged: 0,
    });
    expect(expectImported(await service.importOpm())).toMatchObject({
      read: 2,
      created: 0,
      updated: 0,
      unchanged: 2,
    });
    expect(repository.rows.size).toBe(2);
    expect(repository.writes).toEqual(["created", "created", "unchanged", "unchanged"]);
  });

  it("updates only the records whose source payload actually changed", async () => {
    const { service, repository } = buildService([
      { result: [{ id: 1, title: "before" }, { id: 2, title: "stable" }] },
      { result: [{ id: 1, title: "after" }, { id: 2, title: "stable" }] },
    ]);

    await service.importOpm();

    expect(expectImported(await service.importOpm())).toMatchObject({
      read: 2,
      created: 0,
      updated: 1,
      unchanged: 1,
    });
    expect(repository.rows.get("opm:1")?.payload).toEqual({ id: 1, title: "after" });
  });

  it("fingerprints independently of key order, so reordered JSON is not a change", async () => {
    const { service } = buildService([
      { result: [{ id: 1, a: "x", b: "y" }] },
      { result: [{ b: "y", a: "x", id: 1 }] },
    ]);

    await service.importOpm();

    expect(expectImported(await service.importOpm())).toMatchObject({
      unchanged: 1,
      updated: 0,
    });
  });

  it("counts records with no usable id as skipped instead of dropping them silently", async () => {
    const { service, repository } = buildService([
      { result: [{ id: 1 }, { name: "no id" }, { id: "" }, null, { id: 7 }] },
    ]);

    expect(expectImported(await service.importOpm())).toMatchObject({
      read: 5,
      created: 2,
      skipped: 3,
    });
    expect(repository.rows.size).toBe(2);
  });

  it("normalizes numeric and string ids to the same mirror key", async () => {
    const { service, repository } = buildService([
      { result: [{ id: 42 }] },
      { result: [{ id: 42 }] },
    ]);

    await service.importOpm();
    await service.importOpm();

    expect(repository.rows.size).toBe(1);
    expect([...repository.rows.keys()]).toEqual(["opm:42"]);
  });

  it("stops at the page cap and reports the run as truncated", async () => {
    // A source that always advertises another page must not loop forever.
    class EndlessReadClient extends BitrixReadClient {
      pages = 0;
      async callList(): Promise<BitrixListResponse> {
        this.pages += 1;
        return { result: [], next: this.pages };
      }
    }
    const client = new EndlessReadClient();
    const service = new BitrixImportService(
      client,
      new InMemoryBitrixRepository(),
      configStub(CREDENTIAL),
    );

    expect(expectImported(await service.importOpm()).truncated).toBe(true);
    expect(client.pages).toBe(BITRIX_MAX_PAGES);
  });

  it("records a successful run on the integration row (lastSyncAt, no error)", async () => {
    const { service, repository } = buildService([{ result: [{ id: 1 }] }]);

    await service.importOpm();

    expect(repository.syncOutcomes).toEqual([{ at: expect.any(Date), error: null }]);
  });

  it("records a failed run with the error message and rethrows the original error", async () => {
    class FailingReadClient extends BitrixReadClient {
      async callList(): Promise<BitrixListResponse> {
        throw new Error("Bitrix read failed: status=500");
      }
    }
    const repository = new InMemoryBitrixRepository();
    const service = new BitrixImportService(
      new FailingReadClient(),
      repository,
      configStub(CREDENTIAL),
    );

    await expect(service.importOpm()).rejects.toThrow("Bitrix read failed: status=500");
    expect(repository.syncOutcomes).toEqual([
      { at: expect.any(Date), error: "Bitrix read failed: status=500" },
    ]);
  });

  it("never issues a write-shaped Bitrix method", async () => {
    const { service, client } = buildService([{ result: [{ id: 1 }], next: 1 }, { result: [] }]);

    await service.importOpm();

    for (const call of client.calls) {
      expect(call.method).toBe("crm.item.list");
    }
  });
});
