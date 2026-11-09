import { afterEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

import { AuditAppender } from "../audit/audit-appender";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import * as acesso from "./acesso-comercial";
import { contarNegociosDosPipelines } from "./pipeline-counts.persistence";
import { PrismaPipelinesRepository } from "./prisma-pipelines.repository";

const id = (number: number) => `abcdef00-0000-4000-8000-${String(number).padStart(12, "0")}`;
const principal: AuthPrincipal = { id: id(1), kind: "user", acesso: { plataforma: null, departamentos: [] } };

afterEach(() => vi.restoreAllMocks());
describe("contagens da listagem de pipelines", () => {
  it("agrega uma só vez por pipeline e etapa sem restringir status ou arquivamento", async () => {
    const prisma = new PrismaService();
    const query = vi.spyOn(prisma, "$queryRaw").mockResolvedValue([
      { pipeline_id: "p1", stage_id: "s1", count: 3 },
      { pipeline_id: "p1", stage_id: "s2", count: 2 },
      { pipeline_id: "p2", stage_id: "s3", count: 4 },
    ]);
    const counts = await contarNegociosDosPipelines(prisma, ["p1", "p2", "empty"]);
    expect(counts.pipelines.get("p1")).toBe(5);
    expect(counts.pipelines.get("p2")).toBe(4);
    expect(counts.pipelines.get("empty") ?? 0).toBe(0);
    expect(counts.stages.get("s2")).toBe(2);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toMatchObject({ strings: expect.arrayContaining([expect.stringContaining("GROUP BY pipeline_id, stage_id")]) });
    expect(JSON.stringify(query.mock.calls[0]?.[0])).not.toContain("status");
    await contarNegociosDosPipelines(prisma, []);
    expect(query).toHaveBeenCalledOnce();
  });

  it.each([
    { gerente: false, filtrado: false, uppercase: false }, { gerente: true, filtrado: false, uppercase: false },
    { gerente: false, filtrado: true, uppercase: false }, { gerente: true, filtrado: true, uppercase: false },
    { gerente: false, filtrado: true, uppercase: true }, { gerente: true, filtrado: true, uppercase: true },
  ])("preserva 209 definições em lotes RLS limitados, com DTO, ordem e contagens fiéis ($gerente/$filtrado/$uppercase)", async ({ gerente, filtrado, uppercase }) => {
    const prisma = new PrismaService();
    vi.spyOn(acesso, "lerAcessoComercial").mockResolvedValue({ podeOperar: true, admin: false, gestorEm: gerente ? ["plugga", "waze"] : [] });
    const definitions = Array.from({ length: 209 }, (_, index) => ({
      id: id(100 + index), companyId: "plugga", name: `Pipeline ${index}`, description: null,
      valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
      archivedAt: index ? new Date("2026-11-01T00:00:00Z") : null,
      updatedAt: new Date("2026-11-06T00:00:00Z"), updatedBy: null, tags: [], lossReasons: [], members: [],
      fields: [{ id: id(9000 + index), name: "Texto", type: "text", options: [], showOnCard: true, showInList: false, position: 0, valueCount: 0 }],
      stages: [0, 1].map((position) => ({ id: id(1000 + index * 2 + position), name: `Etapa ${position}`, color: "#0077FF", position, staleAfterDays: null, asksClientConversion: false })),
    })).filter((_, index) => !filtrado || index === 0);
    const transactions: { tx: PrismaService; scope?: string[]; aggregates: unknown[][] }[] = [];
    const readIds: unknown[] = [];
    vi.spyOn(prisma, "comContexto").mockImplementation(async (callback: unknown) => {
      if (typeof callback !== "function") throw new Error("Callback de contexto esperado.");
      const tx = new PrismaService();
      const record: (typeof transactions)[number] = { tx, aggregates: [] };
      transactions.push(record);
      vi.spyOn(tx.user, "findMany").mockResolvedValue([]);
      const query = vi.spyOn(tx, "$queryRaw");
      vi.spyOn(tx.pipeline, "findMany").mockImplementation((async (args?: Prisma.PipelineFindManyArgs) => {
        if (args?.select) {
          readIds.push(args);
          return definitions.map(({ id }) => ({ id })) as never;
        }
        expect(args?.include).toMatchObject({
          stages: { orderBy: { position: "asc" } }, _count: false,
          members: { include: { user: { select: { id: true, name: true } } } },
        });
        const filter = args?.where?.id;
        const ids = typeof filter === "string" ? [filter] : filter?.in;
        if (!Array.isArray(ids) || !ids.length || ids.length > 25) throw new Error("Leitura de definições precisa limitar o lote a 25 IDs visíveis.");
        // Colunas UUID do Postgres aceitam filtro uppercase e devolvem lowercase.
        record.scope = ids.map((id) => id.toLowerCase());
        const scoped = definitions.filter((definition) => record.scope!.includes(definition.id));
        query.mockResolvedValueOnce(scoped.flatMap((definition) => definition.stages.map((stage, index) => ({
          pipeline_id: definition.id, stage_id: stage.id, count: index + 1,
        })))).mockResolvedValueOnce(scoped.map((definition) => ({ id: definition.fields[0]!.id, value: null, count: 2 })));
        // O banco pode devolver outra ordem dentro do lote: prevalece a ordem do catálogo de IDs.
        return [...scoped].reverse() as never;
      }) as never);
      const result = await callback(tx);
      record.aggregates = query.mock.calls.map((call) => call as unknown[]);
      return result;
    });
    // O cliente fora da transação não pode fazer consultas sem a identidade RLS.
    const outsideQuery = vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("Consulta fora do contexto RLS"));

    const result = await new PrismaPipelinesRepository(prisma, new AuditAppender()).list(principal, filtrado ? { pipelineId: uppercase ? id(100).toUpperCase() : id(100) } : undefined);

    expect(readIds).toEqual(filtrado ? [] : [{ select: { id: true }, orderBy: { createdAt: "asc" } }]);
    expect(result.pipelines.map((pipeline) => pipeline.id)).toEqual(definitions.map((pipeline) => pipeline.id));
    expect(result.pipelines.slice(0, 3).map((pipeline) => ({
      total: pipeline.dealCount, stages: pipeline.stages.map((stage) => stage.dealCount), archived: pipeline.archivedAt !== null,
    }))).toEqual([
      { total: 3, stages: [1, 2], archived: false },
      { total: 3, stages: [1, 2], archived: true },
      { total: 3, stages: [1, 2], archived: true },
    ].slice(0, filtrado ? 1 : 3));
    expect(result.pipelines.every((pipeline) => pipeline.canConfigure === gerente)).toBe(true);
    expect(result.pipelines.every((pipeline) => pipeline.fields?.[0]?.valueCount === 2)).toBe(true);
    expect(result.canCreateIn).toEqual(gerente ? ["plugga", "waze"] : []);
    const batches = transactions.filter((transaction) => transaction.scope !== undefined);
    expect(batches).toHaveLength(Math.ceil(definitions.length / 25));
    expect(new Set(batches.map((batch) => batch.tx)).size).toBe(batches.length);
    expect(batches.flatMap((batch) => batch.scope!)).toEqual(definitions.map((definition) => definition.id));
    for (const batch of batches) {
      expect(batch.aggregates).toHaveLength(2);
      const dealsSql = batch.aggregates[0]?.[0] as { values: unknown[] };
      const fieldsSql = batch.aggregates[1]?.[0] as { values: unknown[] };
      expect(new Set(dealsSql.values)).toEqual(new Set(batch.scope));
      expect(new Set(fieldsSql.values)).toEqual(new Set(definitions.filter((definition) => batch.scope!.includes(definition.id)).map((definition) => definition.fields[0]!.id)));
    }
    expect(outsideQuery).not.toHaveBeenCalled();
    expect(vi.mocked(acesso.lerAcessoComercial).mock.calls[0]?.[0]).toBe(transactions[0]?.tx);
    expect(vi.mocked(acesso.lerAcessoComercial).mock.calls[0]?.[1]).toBe(principal.id);
  });
});
