import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { EstadoInvalido } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { PrismaPluggamobRepository } from "../src/pluggamob/prisma-pluggamob.repository.js";

/**
 * Aprovação de fechamento Pluggamob, contra o Postgres de verdade.
 *
 *     RUN_ATOMICIDADE_INTEGRATION_TESTS=true pnpm --filter @plugga/api vitest run test/atomicidade-pluggamob.integration.spec.ts
 *
 * O que se prova: as transições são condicionadas ao status de origem. Um
 * fechamento `approved` nunca volta a `ready_for_review`, e duas aprovações
 * simultâneas geram um único evento `pluggamob.settlement.approved`.
 */
const HABILITADO = process.env.RUN_ATOMICIDADE_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;

describe.skipIf(!HABILITADO)("pluggamob: aprovação de fechamento é condicionada ao status", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaPluggamobRepository(prisma, new AuditAppender());
  const marca = `atom-plug-${randomUUID().slice(0, 8)}`;
  const principal: AuthPrincipal = { id: randomUUID(), kind: "user", roles: ["admin"] };
  let parceiroId = "";
  let semana = 0;

  async function novoFechamento(status: "ready_for_review" | "approved"): Promise<string> {
    semana += 1;
    const inicio = new Date(Date.UTC(2031, 0, 1 + semana * 7));
    const linha = await prisma.settlement.create({
      data: { partnerId: parceiroId, weekStart: inicio, weekEnd: new Date(inicio.getTime() + 6 * 86_400_000), status },
    });
    return linha.id;
  }

  const statusDe = async (id: string) => (await prisma.settlement.findUnique({ where: { id } }))?.status;

  beforeAll(async () => {
    await prisma.$connect();
    parceiroId = (await prisma.partner.create({ data: { key: marca, name: `${marca} parceiro` } })).id;
  }, PRAZO_MS);

  afterAll(async () => {
    // O event_log é só de inserção: o rastro fica, apontando para ids únicos.
    await prisma.settlement.deleteMany({ where: { partnerId: parceiroId } });
    await prisma.partner.deleteMany({ where: { key: marca } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it(
    "aprova um fechamento pronto para revisão e grava o evento",
    async () => {
      const id = await novoFechamento("ready_for_review");

      const detalhe = await repositorio.approve(id, principal);

      expect(detalhe.status).toBe("approved");
      const eventos = await prisma.eventLog.findMany({ where: { eventName: "pluggamob.settlement.approved", entityId: id } });
      expect(eventos).toHaveLength(1);
    },
    PRAZO_MS,
  );

  it(
    "um approved nunca volta a ready_for_review",
    async () => {
      const id = await novoFechamento("approved");

      await expect(repositorio.requestApproval(id, principal)).rejects.toBeInstanceOf(EstadoInvalido);

      expect(await statusDe(id)).toBe("approved");
      expect(
        await prisma.eventLog.count({ where: { eventName: "pluggamob.settlement_approval_requested", entityId: id } }),
      ).toBe(0);
    },
    PRAZO_MS,
  );

  it(
    "aprovar de novo é recusado e não duplica o evento",
    async () => {
      const id = await novoFechamento("ready_for_review");
      await repositorio.approve(id, principal);

      await expect(repositorio.approve(id, principal)).rejects.toBeInstanceOf(EstadoInvalido);

      expect(await statusDe(id)).toBe("approved");
      expect(await prisma.eventLog.count({ where: { eventName: "pluggamob.settlement.approved", entityId: id } })).toBe(1);
    },
    PRAZO_MS,
  );

  it(
    "aprovação e pedido de revisão simultâneos terminam em approved",
    async () => {
      const id = await novoFechamento("ready_for_review");

      await Promise.allSettled([repositorio.approve(id, principal), repositorio.requestApproval(id, principal)]);

      // Se o pedido de revisão chegou depois da aprovação, a condição o barrou.
      expect(await statusDe(id)).toBe("approved");
    },
    PRAZO_MS,
  );
});
