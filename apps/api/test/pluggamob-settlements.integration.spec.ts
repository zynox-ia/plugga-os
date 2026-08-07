import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../src/prisma/prisma.service";
import { PrismaSettlementsRepository } from "../src/pluggamob/settlements/prisma-settlements.repository";

const describeIntegration = process.env.RUN_PLUGGAMOB_INTEGRATION_TESTS === "true" ? describe : describe.skip;

describeIntegration("PluggaMob settlements persistence", () => {
  const prisma = new PrismaClient();
  const settlementIds: string[] = [];
  let partnerId: string;
  let repository: PrismaSettlementsRepository;

  beforeAll(async () => {
    await prisma.$connect();
    repository = new PrismaSettlementsRepository(prisma as PrismaService);
    const partner = await prisma.partner.create({
      data: { key: `settlements-test-${randomUUID()}`, name: "Parceiro de teste" },
    });
    partnerId = partner.id;
  });

  afterAll(async () => {
    if (settlementIds.length > 0) {
      await prisma.settlement.deleteMany({ where: { id: { in: settlementIds } } });
    }
    if (partnerId) await prisma.partner.delete({ where: { id: partnerId } });
    await prisma.$disconnect();
  });

  it("blocks approval, audits every successful transition and creates only a local D+14 credit", async () => {
    const settlement = await prisma.settlement.create({
      data: {
        partnerId,
        weekStart: new Date("2026-09-07T04:00:00.000Z"),
        weekEnd: new Date("2026-09-14T03:59:59.999Z"),
        status: "auditing",
        lines: {
          create: {
            tokenRfid: "INTEGRATION-RFID-001",
            classification: "rfid_physical",
            amount: "75.50",
            blockedReason: "RFID físico sem valoração",
            blockerAssignee: "Financeiro PluggaMob",
            blockerEvidenceMissing: "Tabela de tarifa",
            blockerNextAction: "Anexar evidência local",
          },
        },
      },
      include: { lines: true },
    });
    settlementIds.push(settlement.id);
    const lineId = settlement.lines[0]?.id;
    expect(lineId).toBeDefined();
    const context = { actorId: randomUUID(), occurredAt: new Date("2026-09-15T12:00:00.000Z") };

    await expect(repository.requestApproval(settlement.id, undefined, context)).resolves.toEqual({
      kind: "blocked",
    });
    await expect(repository.approve(settlement.id, undefined, context)).resolves.toEqual({
      kind: "invalid_status",
    });
    expect(await prisma.eventLog.count({ where: { entityId: settlement.id } })).toBe(0);

    const resolved = await repository.resolveBlocker(
      settlement.id,
      lineId!,
      "Tarifa validada no banco local",
      context,
    );
    expect(resolved.kind).toBe("ok");
    if (resolved.kind === "ok") {
      expect(resolved.settlement.status).toBe("auditing");
      expect(resolved.settlement.lines[0]?.blockedReason).toBeNull();
    }

    const requested = await repository.requestApproval(settlement.id, "Auditoria limpa", context);
    expect(requested.kind === "ok" && requested.settlement.status).toBe("ready_for_review");

    const approved = await repository.approve(settlement.id, "Aprovação financeira", context);
    expect(approved.kind === "ok" && approved.settlement.status).toBe("approved");

    const credit = await prisma.d14Credit.findFirstOrThrow({ where: { settlementId: settlement.id } });
    expect(credit.amount.toFixed(2)).toBe("75.50");
    expect(credit.availableAt.toISOString()).toBe("2026-09-28T03:59:59.999Z");
    expect(credit.status).toBe("scheduled");

    const events = await prisma.eventLog.findMany({
      where: { entityId: settlement.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => event.eventName)).toEqual([
      "pluggamob.settlement_blocker_resolved",
      "pluggamob.settlement_approval_requested",
      "pluggamob.settlement_approved",
    ]);
    expect(events.every((event) => event.actorId === context.actorId)).toBe(true);
    expect(events[2]?.payload).toMatchObject({ externalTransferExecuted: false, amount: "75.50" });
  });

  it("rejects approval if a blocker exists even in ready_for_review state", async () => {
    const settlement = await prisma.settlement.create({
      data: {
        partnerId,
        weekStart: new Date("2026-09-14T04:00:00.000Z"),
        weekEnd: new Date("2026-09-21T03:59:59.999Z"),
        status: "ready_for_review",
        lines: {
          create: {
            tokenRfid: "INTEGRATION-RFID-002",
            classification: "unclassified",
            blockedReason: "Sessão sem classificação",
            blockerAssignee: "Financeiro PluggaMob",
            blockerEvidenceMissing: "Classificação da sessão",
            blockerNextAction: "Classificar sessão",
          },
        },
      },
    });
    settlementIds.push(settlement.id);

    const result = await repository.approve(settlement.id, undefined, {
      actorId: randomUUID(),
      occurredAt: new Date(),
    });

    expect(result).toEqual({ kind: "blocked" });
    expect(await prisma.d14Credit.count({ where: { settlementId: settlement.id } })).toBe(0);
    expect(await prisma.eventLog.count({ where: { entityId: settlement.id } })).toBe(0);
  });
});
