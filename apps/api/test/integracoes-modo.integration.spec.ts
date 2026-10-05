import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { PrismaIntegrationsRepository } from "../src/integrations/prisma-integrations.repository.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * A troca de modo de uma integração, contra o Postgres de verdade.
 *
 * Fica atrás de variável porque exige banco no ar:
 *
 *     docker compose up -d postgres
 *     pnpm --filter @plugga/api test:integrations
 *
 * O que se prova é a atomicidade: a troca do modo e o evento
 * `integrations.mode.changed` saem na mesma transação. Mock não mostra isso.
 */
const HABILITADO = process.env.RUN_INTEGRATIONS_INTEGRATION_TESTS === "true";

const PRAZO_MS = 60_000;

describe.skipIf(!HABILITADO)("troca de modo da integração", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaIntegrationsRepository(prisma, new AuditAppender());
  // Chave própria do teste: o log de eventos é só de inserção, então o rastro
  // fica, mas nunca na linha de uma integração real.
  const chave = `teste-modo-${Date.now()}`;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.integration.create({ data: { key: chave, name: "Integração de teste", owner: "teste", mode: "mock" } });
  }, PRAZO_MS);

  afterAll(async () => {
    await prisma.integration.deleteMany({ where: { key: chave } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it(
    "grava o novo modo e o evento com de/para, sem dado pessoal",
    async () => {
      const resultado = await repositorio.alterarModo(chave, "read_only", null);

      expect(resultado).toEqual({ anterior: "mock", atual: "read_only" });
      const linha = await prisma.integration.findUnique({ where: { key: chave } });
      expect(linha?.mode).toBe("read_only");

      const eventos = await prisma.eventLog.findMany({
        where: { eventName: "integrations.mode.changed", entityId: chave },
      });
      expect(eventos).toHaveLength(1);
      expect(eventos[0]?.payload).toEqual({ de: "mock", para: "read_only" });
    },
    PRAZO_MS,
  );

  it(
    "não grava evento quando o modo não muda",
    async () => {
      await repositorio.alterarModo(chave, "read_only", null);

      const eventos = await prisma.eventLog.findMany({
        where: { eventName: "integrations.mode.changed", entityId: chave },
      });
      expect(eventos).toHaveLength(1);
    },
    PRAZO_MS,
  );

  it(
    "devolve nulo para integração que não existe",
    async () => {
      expect(await repositorio.alterarModo(`${chave}-x`, "write", null)).toBeNull();
    },
    PRAZO_MS,
  );
});
