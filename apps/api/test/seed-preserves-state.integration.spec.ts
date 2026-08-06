import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

/**
 * Opt-in smoke test (mirrors test:db/test:jobs/test:bitrix): runs the real seed
 * command an operator runs and proves a re-seed does not revert a cutover.
 * Skipped unless RUN_SEED_INTEGRATION_TESTS=true with Postgres reachable.
 */
const enabled = process.env.RUN_SEED_INTEGRATION_TESTS === "true";
const describeSeed = enabled ? describe : describe.skip;

const REPO_ROOT = path.resolve(process.cwd(), "../..");

async function runSeed(): Promise<void> {
  await execFileAsync("pnpm", ["db:seed"], { cwd: REPO_ROOT, timeout: 120_000 });
}

describeSeed("seed preserves integration cutover state (integration)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await runSeed();
  }, 180_000);

  afterAll(async () => {
    // Leave the local database on the documented default.
    await prisma.integration.update({
      where: { key: "bitrix" },
      data: { mode: "mock", status: "unknown", lastError: null, lastSyncAt: null },
    });
    await prisma.$disconnect();
  });

  it("does not revert a read_only cutover on re-seed", async () => {
    await prisma.integration.update({
      where: { key: "bitrix" },
      data: { mode: "read_only" },
    });

    await runSeed();

    const bitrix = await prisma.integration.findUniqueOrThrow({ where: { key: "bitrix" } });
    // Reverting this would silently close the migrator's gate.
    expect(bitrix.mode).toBe("read_only");
  }, 180_000);

  it("preserves operational status, lastError and lastSyncAt on re-seed", async () => {
    const lastSyncAt = new Date("2026-08-06T12:00:00.000Z");
    await prisma.integration.update({
      where: { key: "bitrix" },
      data: { status: "degraded", lastError: "read timeout", lastSyncAt },
    });

    await runSeed();

    const bitrix = await prisma.integration.findUniqueOrThrow({ where: { key: "bitrix" } });
    expect(bitrix.status).toBe("degraded");
    expect(bitrix.lastError).toBe("read timeout");
    expect(bitrix.lastSyncAt?.toISOString()).toBe(lastSyncAt.toISOString());
  }, 180_000);

  it("still refreshes catalog metadata (name and owner)", async () => {
    await prisma.integration.update({
      where: { key: "bitrix" },
      data: { name: "stale name", owner: "stale owner" },
    });

    await runSeed();

    const bitrix = await prisma.integration.findUniqueOrThrow({ where: { key: "bitrix" } });
    expect(bitrix.name).toBe("Bitrix");
    expect(bitrix.owner).toBe("Operações");
  }, 180_000);

  it("still creates a missing integration in mock mode", async () => {
    const key = "pagbank";
    await prisma.integration.delete({ where: { key } });

    await runSeed();

    const recreated = await prisma.integration.findUniqueOrThrow({ where: { key } });
    expect(recreated.mode).toBe("mock");
    expect(recreated.status).toBe("unknown");
  }, 180_000);
});

describeSeed("seed preserves user access revocation (integration)", () => {
  const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? "admin@plugga.local").toLowerCase();
  const DEV_EMAIL = "dev@plugga.local";
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await runSeed();
  }, 180_000);

  afterAll(async () => {
    // Leave the local database usable: both seeded identities active again.
    await prisma.user.updateMany({
      where: { email: { in: [ADMIN_EMAIL, DEV_EMAIL] } },
      data: { status: "active" },
    });
    await prisma.$disconnect();
  });

  it.each([
    ["admin", () => ADMIN_EMAIL],
    ["dev", () => DEV_EMAIL],
  ])("does not reactivate a deactivated %s user on re-seed", async (_label, emailOf) => {
    const email = emailOf();
    await prisma.user.update({ where: { email }, data: { status: "disabled" } });

    await runSeed();

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    // Reactivating here would silently restore login for a revoked account.
    expect(user.status).toBe("disabled");
  }, 180_000);

  it("still refreshes the seeded display name of an existing user", async () => {
    await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { name: "stale name" } });

    await runSeed();

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN_EMAIL } });
    expect(admin.name).toBe("Administração Local");
  }, 180_000);

  it("still creates a missing seeded user as active", async () => {
    const devUser = await prisma.user.findUniqueOrThrow({ where: { email: DEV_EMAIL } });
    await prisma.userRole.deleteMany({ where: { userId: devUser.id } });
    await prisma.user.delete({ where: { email: DEV_EMAIL } });

    await runSeed();

    const recreated = await prisma.user.findUniqueOrThrow({ where: { email: DEV_EMAIL } });
    expect(recreated.status).toBe("active");
  }, 180_000);
});
