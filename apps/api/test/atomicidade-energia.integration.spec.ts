import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { EstadoInvalido } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { PrismaEnergyRepository } from "../src/energy/prisma-energy.repository.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Atomicidade da aprovação e do envio do relatório do ciclo de energia, contra
 * o Postgres de verdade (T088).
 *
 * Fica atrás de variável porque exige banco no ar:
 *
 *     RUN_ATOMICIDADE_INTEGRATION_TESTS=true pnpm --filter @plugga/api vitest run test/atomicidade-energia.integration.spec.ts
 *
 * O que se prova: (1) duas aprovações simultâneas, uma vence e a outra recebe
 * CONFLITO_ESTADO; (2) falha entre a escrita do ciclo e a do evento não deixa
 * nada parcial; (3) um evento por efeito. O `event_log` é só de inserção, então
 * os eventos ficam, mas presos a ids de ciclo gerados só para este teste.
 */
const HABILITADO = process.env.RUN_ATOMICIDADE_INTEGRATION_TESTS === "true";

const PRAZO_MS = 60_000;

/** Auditoria que falha depois de o ciclo já ter sido escrito na transação. */
class AuditoriaQueFalha extends AuditAppender {
  override async append(): Promise<void> {
    throw new Error("falha simulada entre a escrita do ciclo e a do evento");
  }
}

describe.skipIf(!HABILITADO)("atomicidade do relatório do ciclo de energia", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaEnergyRepository(prisma, new AuditAppender());
  const repositorioComFalha = new PrismaEnergyRepository(prisma, new AuditoriaQueFalha());

  const sufixo = randomUUID().slice(0, 8);
  let userId = "";
  let clientId = "";
  let consumerUnitId = "";
  let principal: AuthPrincipal;
  const ciclosCriados: string[] = [];
  let mes = 0;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: { email: `atomicidade-energia-${sufixo}@teste.invalid`, name: `Teste atomicidade ${sufixo}` },
    });
    userId = user.id;
    principal = { id: userId, kind: "user", roles: [] };
    const client = await prisma.client.create({ data: { name: `Cliente atomicidade ${sufixo}` } });
    clientId = client.id;
    const unit = await prisma.consumerUnit.create({
      data: { clientId, code: `UC-${sufixo}`, distributor: "Distribuidora de teste" },
    });
    consumerUnitId = unit.id;
  }, PRAZO_MS);

  afterAll(async () => {
    // O cliente leva consigo, em cascata, as unidades e os ciclos de teste.
    if (clientId) await prisma.client.deleteMany({ where: { id: clientId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  /** Ciclo com relatório gerado, pronto para aprovar (competência única por chamada). */
  async function cicloComRelatorioGerado(): Promise<string> {
    mes += 1;
    const ciclo = await prisma.cycle.create({
      data: {
        clientId,
        consumerUnitId,
        competenceMonth: mes,
        competenceYear: 2099,
        status: "relatorio_pronto",
        ownerId: userId,
        nextActionAt: new Date(Date.now() + 86_400_000),
        reportStatus: "gerado",
        reportVersion: 1,
        reportGeneratedAt: new Date(),
      },
    });
    ciclosCriados.push(ciclo.id);
    return ciclo.id;
  }

  function eventos(eventName: string, entityId: string) {
    return prisma.eventLog.findMany({ where: { eventName, entityType: "cycle", entityId } });
  }

  it(
    "duas aprovações simultâneas: uma vence e a outra recebe CONFLITO_ESTADO",
    async () => {
      const id = await cicloComRelatorioGerado();

      const resultados = await Promise.allSettled([
        repositorio.approveCycleReport(id, {}, principal),
        repositorio.approveCycleReport(id, {}, principal),
      ]);

      const vencedoras = resultados.filter((r) => r.status === "fulfilled");
      const perdedoras = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(vencedoras).toHaveLength(1);
      expect(perdedoras).toHaveLength(1);
      expect(perdedoras[0]?.reason).toBeInstanceOf(EstadoInvalido);
      expect((perdedoras[0]?.reason as EstadoInvalido).codigo).toBe("CONFLITO_ESTADO");

      const linha = await prisma.cycle.findUniqueOrThrow({ where: { id } });
      expect(linha.reportStatus).toBe("aprovado");
      expect(linha.status).toBe("validado_internamente");
      expect(linha.reportApprovedById).toBe(userId);
      // Um efeito, um evento: a perdedora não deixa rastro.
      expect(await eventos("energy.cycle_report_approved", id)).toHaveLength(1);
    },
    PRAZO_MS,
  );

  it(
    "falha entre a escrita do ciclo e a do evento não deixa nada parcial",
    async () => {
      const id = await cicloComRelatorioGerado();

      await expect(repositorioComFalha.approveCycleReport(id, {}, principal)).rejects.toThrow(/falha simulada/);

      const linha = await prisma.cycle.findUniqueOrThrow({ where: { id } });
      expect(linha.reportStatus).toBe("gerado");
      expect(linha.status).toBe("relatorio_pronto");
      expect(linha.reportApprovedAt).toBeNull();
      expect(linha.reportApprovedById).toBeNull();
      expect(await eventos("energy.cycle_report_approved", id)).toHaveLength(0);
    },
    PRAZO_MS,
  );

  it(
    "falha no envio também desfaz a escrita do ciclo",
    async () => {
      const id = await cicloComRelatorioGerado();
      await repositorio.approveCycleReport(id, {}, principal);

      await expect(repositorioComFalha.sendCycleReport(id, { realizedSavings: "10.00" }, principal)).rejects.toThrow(
        /falha simulada/,
      );

      const linha = await prisma.cycle.findUniqueOrThrow({ where: { id } });
      expect(linha.status).toBe("validado_internamente");
      expect(linha.reportSentAt).toBeNull();
      expect(linha.realizedSavings).toBeNull();
      expect(await eventos("energy.cycle_report_sent", id)).toHaveLength(0);
    },
    PRAZO_MS,
  );

  it(
    "aprovar e enviar em sequência grava um evento por efeito; envios simultâneos têm uma só vencedora",
    async () => {
      const id = await cicloComRelatorioGerado();
      await repositorio.approveCycleReport(id, {}, principal);

      const resultados = await Promise.allSettled([
        repositorio.sendCycleReport(id, {}, principal),
        repositorio.sendCycleReport(id, {}, principal),
      ]);
      expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const perdedora = resultados.find((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(perdedora?.reason).toBeInstanceOf(EstadoInvalido);

      const linha = await prisma.cycle.findUniqueOrThrow({ where: { id } });
      expect(linha.status).toBe("enviado");
      expect(linha.reportSentAt).not.toBeNull();
      expect(await eventos("energy.cycle_report_approved", id)).toHaveLength(1);
      expect(await eventos("energy.cycle_report_sent", id)).toHaveLength(1);
    },
    PRAZO_MS,
  );

  it(
    "aprovar de novo um relatório já aprovado devolve CONFLITO_ESTADO sem novo evento",
    async () => {
      const id = await cicloComRelatorioGerado();
      await repositorio.approveCycleReport(id, {}, principal);

      await expect(repositorio.approveCycleReport(id, {}, principal)).rejects.toBeInstanceOf(EstadoInvalido);

      expect(await eventos("energy.cycle_report_approved", id)).toHaveLength(1);
    },
    PRAZO_MS,
  );
});
