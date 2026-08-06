import { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";

import { BitrixImportService } from "./bitrix-import.service";
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

  async getIntegrationMode(): Promise<"read_only"> {
    return "read_only";
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
}

function buildService(
  pages: BitrixListResponse[],
  environment: Record<string, unknown> = {},
) {
  const client = new StubReadClient(pages);
  const repository = new InMemoryBitrixRepository();
  const config = new ConfigService({
    BITRIX_OPM_ENTITY_TYPE_ID: 1032,
    BITRIX_IMPORT_PAGE_SIZE: 50,
    ...environment,
  });
  return { service: new BitrixImportService(client, repository, config), client, repository };
}

describe("BitrixImportService.importOpm", () => {
  it("refuses to run when the OPM entity type is not configured", async () => {
    const { service, client } = buildService([], { BITRIX_OPM_ENTITY_TYPE_ID: undefined });

    await expect(service.importOpm()).rejects.toThrow(/BITRIX_OPM_ENTITY_TYPE_ID/);
    expect(client.calls).toHaveLength(0);
  });

  it("reads the OPM domain with a read-only list method and the configured page size", async () => {
    const { service, client } = buildService([{ result: [{ id: 1 }] }], {
      BITRIX_IMPORT_PAGE_SIZE: 25,
    });

    const summary = await service.importOpm();

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

    const summary = await service.importOpm();

    expect(client.calls.map((call) => call.start)).toEqual([0, 2, 3]);
    expect(summary).toMatchObject({ read: 4, created: 4, updated: 0, unchanged: 0 });
    expect(repository.rows.size).toBe(4);
    expect(summary.truncated).toBe(false);
  });

  it("is idempotent: re-importing identical data writes nothing", async () => {
    const page = { result: [{ id: 1, title: "OPM-1" }, { id: 2, title: "OPM-2" }] };
    const { service, repository } = buildService([page, page]);

    const first = await service.importOpm();
    expect(first).toMatchObject({ read: 2, created: 2, updated: 0, unchanged: 0 });

    const second = await service.importOpm();
    expect(second).toMatchObject({ read: 2, created: 0, updated: 0, unchanged: 2 });
    expect(repository.rows.size).toBe(2);
    expect(repository.writes).toEqual(["created", "created", "unchanged", "unchanged"]);
  });

  it("updates only the records whose source payload actually changed", async () => {
    const { service, repository } = buildService([
      { result: [{ id: 1, title: "before" }, { id: 2, title: "stable" }] },
      { result: [{ id: 1, title: "after" }, { id: 2, title: "stable" }] },
    ]);

    await service.importOpm();
    const second = await service.importOpm();

    expect(second).toMatchObject({ read: 2, created: 0, updated: 1, unchanged: 1 });
    expect(repository.rows.get("opm:1")?.payload).toEqual({ id: 1, title: "after" });
  });

  it("fingerprints independently of key order, so reordered JSON is not a change", async () => {
    const { service } = buildService([
      { result: [{ id: 1, a: "x", b: "y" }] },
      { result: [{ b: "y", a: "x", id: 1 }] },
    ]);

    await service.importOpm();

    await expect(service.importOpm()).resolves.toMatchObject({ unchanged: 1, updated: 0 });
  });

  it("counts records with no usable id as skipped instead of dropping them silently", async () => {
    const { service, repository } = buildService([
      { result: [{ id: 1 }, { name: "no id" }, { id: "" }, null, { id: 7 }] },
    ]);

    const summary = await service.importOpm();

    expect(summary).toMatchObject({ read: 5, created: 2, skipped: 3 });
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
      new ConfigService({ BITRIX_OPM_ENTITY_TYPE_ID: 1032 }),
    );

    const summary = await service.importOpm();

    expect(summary.truncated).toBe(true);
    expect(client.pages).toBe(BITRIX_MAX_PAGES);
  });

  it("never issues a write-shaped Bitrix method", async () => {
    const { service, client } = buildService([{ result: [{ id: 1 }], next: 1 }, { result: [] }]);

    await service.importOpm();

    for (const call of client.calls) {
      expect(call.method).toMatch(/\.(list|get|fields)$/);
    }
  });
});
