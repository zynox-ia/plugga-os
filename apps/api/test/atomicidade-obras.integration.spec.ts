import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { EstadoInvalido } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { PrismaObrasRepository } from "../src/obras/prisma-obras.repository.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Atomicidade das transições de Obras, contra o Postgres de verdade (T090).
 *
 * Fica atrás de variável porque exige banco no ar:
 *
 *     RUN_ATOMICIDADE_INTEGRATION_TESTS=true pnpm --filter @plugga/api vitest run test/atomicidade-obras.integration.spec.ts
 *
 * Mock não prova a corrida: o que se verifica é que o `WHERE` condicionado e a
 * unicidade (obraId, versao) decidem sozinhos quem vence quando duas
 * requisições chegam juntas.
 */
const HABILITADO = process.env.RUN_ATOMICIDADE_INTEGRATION_TESTS === "true";

const PRAZO_MS = 60_000;

describe.skipIf(!HABILITADO)("atomicidade de Obras", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaObrasRepository(prisma, new AuditAppender());

  // Marca própria: o `event_log` é só de inserção, então o rastro fica, mas
  // sempre ligado a obras com id único criadas aqui.
  const marca = `it-obras-${randomUUID().slice(0, 8)}`;
  const principal: AuthPrincipal = { id: "", kind: "user", roles: ["engenheiro"] };
  const outraPessoa: AuthPrincipal = { id: "", kind: "user", roles: ["seguranca"] };
  let obraId = "";
  let obraDeProjetoId = "";

  beforeAll(async () => {
    await prisma.$connect();
    const criarPessoa = async (papel: string): Promise<string> =>
      (await prisma.user.create({ data: { email: `${marca}-${papel}@teste.local`, name: `${marca} ${papel}`, status: "active" } })).id;
    principal.id = await criarPessoa("engenheiro");
    outraPessoa.id = await criarPessoa("seguranca");

    obraId = (await prisma.obra.create({ data: { companyId: "plugga", nome: `${marca} obra` } })).id;
    obraDeProjetoId = (
      await prisma.obra.create({ data: { companyId: "plugga", nome: `${marca} projeto`, etapaAtual: "projeto_em_elaboracao" } })
    ).id;
  }, PRAZO_MS);

  afterAll(async () => {
    // Registros filhos saem em cascata com a obra. O `event_log` fica (append-only).
    await prisma.obra.deleteMany({ where: { nome: { startsWith: marca } } });
    await prisma.user.deleteMany({ where: { name: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it(
    "assinar a APR duas vezes preserva a primeira assinatura e recusa a segunda",
    async () => {
      const apr = await repositorio.registrarApr(obraId, { companyId: "plugga", atividade: "trabalho em altura" }, principal);

      const primeira = await repositorio.assinarApr(obraId, apr.id, { companyId: "plugga", papel: "seguranca" }, principal);
      await expect(
        repositorio.assinarApr(obraId, apr.id, { companyId: "plugga", papel: "seguranca" }, outraPessoa),
      ).rejects.toBeInstanceOf(EstadoInvalido);

      const linha = await prisma.registroApr.findUniqueOrThrow({ where: { id: apr.id } });
      expect(linha.segurancaAssinouId).toBe(principal.id);
      expect(linha.segurancaAssinouEm?.toISOString()).toBe(primeira.segurancaAssinouEm);

      const eventos = await prisma.eventLog.findMany({
        where: { eventName: "obras.apr.signed", entityId: obraId },
      });
      expect(eventos).toHaveLength(1);
      expect(eventos[0]?.payload).toEqual({ aprId: apr.id, papel: "seguranca" });
    },
    PRAZO_MS,
  );

  it(
    "duas revogações simultâneas: uma vence e a outra recebe conflito",
    async () => {
      const liberacao = await repositorio.registrarLiberacao(
        obraId,
        { companyId: "plugga", papelLiberador: "engenheiro" },
        principal,
      );

      const resultados = await Promise.allSettled([
        repositorio.revogarLiberacao(obraId, liberacao.id, { companyId: "plugga", motivoRevogacao: "condição insegura A" }, principal),
        repositorio.revogarLiberacao(obraId, liberacao.id, { companyId: "plugga", motivoRevogacao: "condição insegura B" }, outraPessoa),
      ]);

      const vencedoras = resultados.filter((r) => r.status === "fulfilled");
      const derrotadas = resultados.filter((r) => r.status === "rejected");
      expect(vencedoras).toHaveLength(1);
      expect(derrotadas).toHaveLength(1);
      // 409: perdeu a corrida (EstadoInvalido) ou já viu a revogação (guarda de leitura, 403 do domínio atual).
      const motivo = (derrotadas[0] as PromiseRejectedResult).reason as Error;
      expect(motivo).toBeInstanceOf(Error);

      const eventos = await prisma.eventLog.findMany({
        where: { eventName: "obras.release.revoked", entityId: obraId },
      });
      expect(eventos).toHaveLength(1);
    },
    PRAZO_MS,
  );

  it(
    "duas versões de projeto simultâneas geram versões distintas",
    async () => {
      const entrada = { companyId: "plugga", descricao: `${marca} versão` };
      const resultados = await Promise.allSettled([
        repositorio.criarVersaoDeProjeto(obraDeProjetoId, entrada, null, principal),
        repositorio.criarVersaoDeProjeto(obraDeProjetoId, entrada, null, outraPessoa),
      ]);

      // A que perde a disputa por `versao + 1` repete e ganha a versão seguinte.
      expect(resultados.every((r) => r.status === "fulfilled")).toBe(true);
      const versoes = resultados.map((r) => (r as PromiseFulfilledResult<{ versao: number }>).value.versao);
      expect(new Set(versoes).size).toBe(2);

      const linhas = await prisma.projetoVersao.findMany({ where: { obraId: obraDeProjetoId }, orderBy: { versao: "asc" } });
      expect(linhas.map((l) => l.versao)).toEqual([1, 2]);

      const eventos = await prisma.eventLog.findMany({
        where: { eventName: "obras.project_version.created", entityId: obraDeProjetoId },
      });
      expect(eventos).toHaveLength(2);
    },
    PRAZO_MS,
  );
});
