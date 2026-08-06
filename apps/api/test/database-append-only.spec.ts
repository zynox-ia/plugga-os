import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databaseTestsEnabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "true";
const describeDatabase = databaseTestsEnabled ? describe : describe.skip;

describeDatabase("append-only database triggers", () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects UPDATE and DELETE for agent_actions", async () => {
    const id = randomUUID();

    await prisma.agentAction.create({
      data: {
        id,
        agent: "ci-append-only-probe",
        channel: "ci",
        action: "foundation.append-only.verify",
        entityType: "ci_probe",
        entityId: id,
        input: {},
        payload: {},
        decision: "allowed",
        approvalStatus: "not_required",
        status: "recorded",
      },
    });

    await expect(
      prisma.agentAction.update({
        where: { id },
        data: { status: "mutated" },
      }),
    ).rejects.toThrow(/agent_actions is append-only; UPDATE is not allowed/);

    await expect(prisma.agentAction.delete({ where: { id } })).rejects.toThrow(
      /agent_actions is append-only; DELETE is not allowed/,
    );
  });

  it("rejects UPDATE and DELETE for event_log", async () => {
    const id = randomUUID();

    await prisma.eventLog.create({
      data: {
        id,
        eventName: "foundation.append-only.verified",
        entityType: "ci_probe",
        entityId: id,
        actorType: "system",
        actorId: "ci",
        payload: {},
        occurredAt: new Date(),
      },
    });

    await expect(
      prisma.eventLog.update({
        where: { id },
        data: { eventName: "foundation.append-only.mutated" },
      }),
    ).rejects.toThrow(/event_log is append-only; UPDATE is not allowed/);

    await expect(prisma.eventLog.delete({ where: { id } })).rejects.toThrow(
      /event_log is append-only; DELETE is not allowed/,
    );
  });
});
