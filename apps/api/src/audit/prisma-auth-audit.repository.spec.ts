import { eventNames } from "@plugga/shared";
import { describe, expect, it, vi } from "vitest";

import type { AgentActionAppend, EventAppend } from "./audit.port";
import type { PrismaAuthService } from "../prisma/prisma-auth.service";
import { PrismaAuthAuditRepository } from "./prisma-auth-audit.repository";

const evento: EventAppend = {
  eventName: eventNames.authResetRequested, entityType: "user", entityId: "pessoa-sintetica",
  actorType: "system", actorId: null, payload: {}, occurredAt: new Date("2026-11-06T12:00:00Z"),
};

describe("auditoria de autenticação no pool dedicado", () => {
  it("grava evento antes da sessão sem pedir leitura de retorno ou transação de domínio", async () => {
    const createMany = vi.fn(async () => ({ count: 1 }));
    const prisma = { eventLog: { createMany } } as unknown as PrismaAuthService;
    const auditoria = new PrismaAuthAuditRepository(prisma);
    await expect(auditoria.appendEvent(evento)).resolves.toBeUndefined();
    expect(createMany).toHaveBeenCalledWith({ data: evento });
  });

  it("recusa trilha de agente sem tocar no banco auth", async () => {
    const createMany = vi.fn();
    const prisma = { eventLog: { createMany } } as unknown as PrismaAuthService;
    const auditoria = new PrismaAuthAuditRepository(prisma);
    await expect(auditoria.appendTrail({} as AgentActionAppend, evento)).rejects.toThrow(/fora do escopo/);
    expect(createMany).not.toHaveBeenCalled();
  });
});
