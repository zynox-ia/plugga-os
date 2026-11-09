import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditAppender } from "../audit/audit-appender";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import * as acesso from "./acesso-comercial";
import { contarNegociosDosPipelines } from "./pipeline-counts.persistence";
import { PrismaPipelinesRepository } from "./prisma-pipelines.repository";

const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
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
    { gerente: false, filtrado: false }, { gerente: true, filtrado: false },
    { gerente: false, filtrado: true }, { gerente: true, filtrado: true },
  ])("preserva contagens, campos e permissão atual com 209 definições ($gerente/$filtrado) na transação RLS", async ({ gerente, filtrado }) => {
    const prisma = new PrismaService();
    const tx = new PrismaService();
    vi.spyOn(prisma, "comContexto").mockImplementation(async (callback: unknown) => {
      if (typeof callback !== "function") throw new Error("Callback de contexto esperado.");
      return callback(tx);
    });
    vi.spyOn(acesso, "lerAcessoComercial").mockResolvedValue({ podeOperar: true, admin: false, gestorEm: gerente ? ["plugga", "waze"] : [] });
    const fieldId = id(9000);
    const definitions = Array.from({ length: 209 }, (_, index) => ({
      id: id(100 + index), companyId: "plugga", name: `Pipeline ${index}`, description: null,
      valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
      archivedAt: index ? new Date("2026-11-01T00:00:00Z") : null,
      updatedAt: new Date("2026-11-06T00:00:00Z"), updatedBy: null, tags: [], lossReasons: [], members: [],
      fields: index ? [] : [{ id: fieldId, name: "Texto", type: "text", options: [], showOnCard: true, showInList: false, position: 0, valueCount: 0 }],
      stages: [0, 1].map((position) => ({ id: id(1000 + index * 2 + position), name: `Etapa ${position}`, color: "#0077FF", position, staleAfterDays: null, asksClientConversion: false })),
    })).filter((_, index) => !filtrado || index === 0);
    const find = vi.spyOn(tx.pipeline, "findMany").mockResolvedValue(definitions as never);
    vi.spyOn(tx.user, "findMany").mockResolvedValue([]);
    // O cliente fora da transação não pode fazer consultas sem a identidade RLS.
    const outsideQuery = vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("Consulta fora do contexto RLS"));
    const query = vi.spyOn(tx, "$queryRaw")
      .mockResolvedValueOnce([
        { pipeline_id: id(100), stage_id: id(1000), count: 3 },
        { pipeline_id: id(100), stage_id: id(1001), count: 2 },
        { pipeline_id: id(101), stage_id: id(1002), count: 4 },
      ])
      .mockResolvedValueOnce([{ id: fieldId, value: null, count: 2 }]);

    const result = await new PrismaPipelinesRepository(prisma, new AuditAppender()).list(principal, filtrado ? { pipelineId: id(100) } : undefined);

    expect(find).toHaveBeenCalledWith({ ...(filtrado ? { where: { id: id(100) } } : {}), orderBy: { createdAt: "asc" }, include: expect.objectContaining({
      stages: { orderBy: { position: "asc" } }, _count: false,
    }) });
    expect(result.pipelines.map((pipeline) => pipeline.id)).toEqual(definitions.map((pipeline) => pipeline.id));
    expect(result.pipelines.slice(0, 3).map((pipeline) => ({
      total: pipeline.dealCount, stages: pipeline.stages.map((stage) => stage.dealCount), archived: pipeline.archivedAt !== null,
    }))).toEqual([
      { total: 5, stages: [3, 2], archived: false },
      { total: 4, stages: [4, 0], archived: true },
      { total: 0, stages: [0, 0], archived: true },
    ].slice(0, filtrado ? 1 : 3));
    expect(result.pipelines.every((pipeline) => pipeline.canConfigure === gerente)).toBe(true);
    expect(result.pipelines[0]?.fields?.[0]?.valueCount).toBe(2);
    expect(result.canCreateIn).toEqual(gerente ? ["plugga", "waze"] : []);
    expect(query).toHaveBeenCalledTimes(2); // Uma agregação de negócios e outra dos campos.
    expect(query.mock.calls[0]?.[0]).toMatchObject({ values: definitions.map((pipeline) => pipeline.id) });
    expect(outsideQuery).not.toHaveBeenCalled();
    expect(vi.mocked(acesso.lerAcessoComercial).mock.calls[0]?.[0]).toBe(tx);
    expect(vi.mocked(acesso.lerAcessoComercial).mock.calls[0]?.[1]).toBe(principal.id);
  });
});
