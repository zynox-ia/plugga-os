import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaService } from "../src/prisma/prisma.service";
import { PrismaBitrixRepository } from "../src/integrations/bitrix/prisma-bitrix.repository";

/**
 * Opt-in smoke test (mirrors test:db/test:jobs): exercises the real mirror
 * upsert against Postgres, proving idempotency is enforced by the
 * (domain, external_id) unique index rather than only by the in-memory double.
 * Skipped unless RUN_BITRIX_INTEGRATION_TESTS=true with Postgres reachable.
 */
const enabled = process.env.RUN_BITRIX_INTEGRATION_TESTS === "true";
const describeBitrix = enabled ? describe : describe.skip;

const DOMAIN = `test-opm-${Date.now()}`;

describeBitrix("Bitrix mirror persistence (integration)", () => {
  let prisma: PrismaClient;
  let repository: PrismaBitrixRepository;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    repository = new PrismaBitrixRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.bitrixMirrorRecord.deleteMany({ where: { domain: DOMAIN } });
    await prisma.$disconnect();
  });

  it("creates, no-ops, and updates a mirror row by (domain, externalId)", async () => {
    const fetchedAt = new Date();

    const created = await repository.upsertMirrorRecord({
      domain: DOMAIN,
      externalId: "42",
      payload: { id: 42, title: "OPM antes" },
      sourceFingerprint: "fingerprint-a",
      fetchedAt,
    });
    expect(created).toBe("created");

    const stored = await prisma.bitrixMirrorRecord.findUniqueOrThrow({
      where: { domain_externalId: { domain: DOMAIN, externalId: "42" } },
    });
    expect(stored.payload).toEqual({ id: 42, title: "OPM antes" });

    // Re-import of identical data must not write at all.
    const unchanged = await repository.upsertMirrorRecord({
      domain: DOMAIN,
      externalId: "42",
      payload: { id: 42, title: "OPM antes" },
      sourceFingerprint: "fingerprint-a",
      fetchedAt: new Date(),
    });
    expect(unchanged).toBe("unchanged");

    const afterNoop = await prisma.bitrixMirrorRecord.findUniqueOrThrow({
      where: { domain_externalId: { domain: DOMAIN, externalId: "42" } },
    });
    expect(afterNoop.updatedAt.toISOString()).toBe(stored.updatedAt.toISOString());

    // Changed source data updates in place — no duplicate row.
    const updated = await repository.upsertMirrorRecord({
      domain: DOMAIN,
      externalId: "42",
      payload: { id: 42, title: "OPM depois" },
      sourceFingerprint: "fingerprint-b",
      fetchedAt: new Date(),
    });
    expect(updated).toBe("updated");

    const rows = await prisma.bitrixMirrorRecord.findMany({ where: { domain: DOMAIN } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload).toEqual({ id: 42, title: "OPM depois" });
    expect(rows[0]!.sourceFingerprint).toBe("fingerprint-b");
  });

  it("rejects a duplicate (domain, externalId) at the database level", async () => {
    await repository.upsertMirrorRecord({
      domain: DOMAIN,
      externalId: "77",
      payload: { id: 77 },
      sourceFingerprint: "fingerprint-c",
      fetchedAt: new Date(),
    });

    await expect(
      prisma.bitrixMirrorRecord.create({
        data: {
          domain: DOMAIN,
          externalId: "77",
          payload: { id: 77 },
          sourceFingerprint: "fingerprint-d",
          fetchedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("keeps the same external id in different domains as distinct rows", async () => {
    const otherDomain = `${DOMAIN}-other`;
    await repository.upsertMirrorRecord({
      domain: otherDomain,
      externalId: "42",
      payload: { id: 42, source: "other" },
      sourceFingerprint: "fingerprint-e",
      fetchedAt: new Date(),
    });

    const rows = await prisma.bitrixMirrorRecord.findMany({
      where: { externalId: "42", domain: { in: [DOMAIN, otherDomain] } },
    });
    expect(rows).toHaveLength(2);

    await prisma.bitrixMirrorRecord.deleteMany({ where: { domain: otherDomain } });
  });
});
