import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  bulkDealsRequestSchema, createDealRequestSchema, createPipelineRequestSchema, pipelineParaEdicao, updatePipelineRequestSchema,
  type DealTransitionOrigin, type Pipeline, type Tela,
} from "@plugga/shared";

import { AuditAppender, PayloadDeAuditoriaInvalido } from "../src/audit/audit-appender";
import { ClientesService } from "../src/clientes/clientes.service";
import { PrismaClientesRepository } from "../src/clientes/prisma-clientes.repository";
import { EstadoInvalido, NaoEncontrado } from "../src/common/errors/dominio";
import type { AuthPrincipal } from "../src/core/auth/auth.types";
import { PrismaNegociosRepository } from "../src/negocios/prisma-negocios.repository";
import { PrismaPipelinesRepository } from "../src/pipelines/prisma-pipelines.repository";
import { contextoBanco } from "../src/prisma/contexto-banco";
import { PrismaService } from "../src/prisma/prisma.service";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

const enabled = process.env.RUN_NEGOCIOS_INTEGRATION_TESTS === "true";
describe.skipIf(!enabled)("transições unificadas: origem, CAS, posição e atomicidade reais", { timeout: 60_000 }, () => {
  const db = new PrismaService();
  const audit = new AuditAppender();
  const pipelines = new PrismaPipelinesRepository(db, audit);
  const deals = new PrismaNegociosRepository(db, audit, new ClientesService(new PrismaClientesRepository(db, audit)));
  const prefix = `transition-${randomUUID().slice(0, 8)}`;
  class RuntimePrisma extends PrismaService {
    override comContexto<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
      return super.comContexto(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime");
        const measured = new Proxy(tx, { get(target, property) {
          if (property !== "$queryRaw") return Reflect.get(target, property);
          return async (...args: unknown[]) => {
            const query = args[0] as Prisma.Sql | TemplateStringsArray;
            const text = "strings" in query ? query.strings.join(" ") : Array.from(query).join(" ");
            const kind = text.includes("FOR UPDATE") ? "lock" : text.includes("UPDATE public.deals") ? "update" : text.includes("GROUP BY") ? "count" : "raw";
            const start = performance.now();
            try { return await Reflect.apply(target.$queryRaw, target, args); }
            finally { console.info("BATCH_MEASURE", kind, Math.round(performance.now() - start)); }
          };
        } });
        return fn(measured);
      });
    }
  }
  const users: { principal: AuthPrincipal; sessionHash: string }[] = [];
  let manager: AuthPrincipal; let member: AuthPrincipal; let outsider: AuthPrincipal;
  const as = <T>(actor: AuthPrincipal, fn: () => Promise<T>): Promise<T> => {
    const user = users.find((user) => user.principal.id === actor.id);
    if (!user) throw new Error("Ator sintético sem sessão.");
    return contextoBanco.run({ sessionHash: user.sessionHash }, fn);
  };
  async function person(level: "gerente" | "membro", screen: boolean | "client" = true) {
    const telas: Tela[] = screen === "client" ? ["crm.clientes"] : screen ? ["crm.pipelines"] : [];
    const user = await db.user.create({ data: {
      name: `${prefix} Pessoa`, email: `${prefix}-${users.length}@teste.local`,
      departamentos: { create: { departamento: "crm", nivel: level, telas } },
    } });
    const principal: AuthPrincipal = { id: user.id, kind: "user", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: level, telas }] } };
    const sessionHash = randomBytes(32).toString("hex");
    await db.session.create({ data: { userId: user.id, tokenHash: sessionHash, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
    users.push({ principal, sessionHash }); return principal;
  }
  const pipeline = () => as(manager, () => pipelines.create(createPipelineRequestSchema.parse({
    companyId: "plugga", name: `${prefix}-${randomUUID().slice(0, 8)}`, description: null, valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: ["A privada", "B privada", "C privada"].map((name) => ({ name, color: "#0077FF", staleAfterDays: null, asksClientConversion: false })),
    tags: [], lossReasons: [{ name: "Motivo privado", asksRevisitDate: false }], fields: [{ name: "Campo privado", type: "text", showOnCard: false, showInList: false }],
  }), manager));
  const create = (p: Pipeline) => as(member, () => deals.create(createDealRequestSchema.parse({
    pipelineId: p.id, stageId: p.stages[0]!.id, title: `${prefix} Negócio`, ownerId: member.id,
    lead: { personType: "pj", name: "Lead privado sintético", phone: "92999990000" }, customFields: { [p.fields![0]!.id]: "Valor privado" },
  }), member));
  const get = (id: string) => as(member, () => deals.get(id, member));
  const events = (id: string) => db.eventLog.findMany({ where: { entityId: id, eventName: "commercial.deal.stage_changed" }, orderBy: { occurredAt: "asc" } });
  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    await db.$connect();
    await db.company.upsert({ where: { id: "plugga" }, create: { id: "plugga", name: "Plugga" }, update: {} });
    manager = await person("gerente"); member = await person("membro"); outsider = await person("membro", false);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await db.deal.deleteMany({ where: { title: { startsWith: prefix } } });
    await db.pipeline.deleteMany({ where: { name: { startsWith: prefix } } });
    await db.session.deleteMany({ where: { userId: { in: users.map((u) => u.principal.id) } } });
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it.each(["quadro", "ficha", "api"] as DealTransitionOrigin[])("%s produz evento completo ligado a UMA história, sem PII", async (origin) => {
    const p = await pipeline(); const deal = await create(p); const before = await get(deal.id);
    expect(await events(deal.id)).toEqual([]);
    await as(member, () => deals.moveStage(deal.id, { stageId: p.stages[1]!.id, origin, version: before.version }, member));
    const current = await get(deal.id); const rows = await events(deal.id);
    expect(rows).toHaveLength(1);
    const history = await db.dealHistory.findFirstOrThrow({ where: { dealId: deal.id, kind: "stage_changed" } });
    expect(rows[0]!.payload).toMatchObject({ transitionId: history.id, dealId: deal.id, companyId: "plugga", fromPipelineId: p.id, toPipelineId: p.id, fromStageId: p.stages[0]!.id, toStageId: p.stages[1]!.id, actorType: "user", actorId: member.id, origin, occurredAt: history.occurredAt.toISOString() });
    expect(current.stageEnteredAt).toBe(history.occurredAt.toISOString());
    expect(current.version).toBe(before.version + 1);
    const listed = await as(member, () => deals.list({ pipelineId: p.id, status: "all" }, member));
    expect(listed.deals.find((d) => d.id === deal.id)?.version).toBe(current.version);
    expect(JSON.stringify(rows)).not.toMatch(/privad|92999990000/);
  });

  it("reorder não reinicia etapa nem emite evento; replay A->B->A é recusado pela versão", async () => {
    const p = await pipeline(); const deal = await create(p); let current = await get(deal.id); const original = current;
    await as(member, () => deals.moveStage(deal.id, { stageId: current.stageId, beforeDealId: null, version: current.version, origin: "quadro" }, member));
    current = await get(deal.id);
    expect(current.stageEnteredAt).toBe(original.stageEnteredAt); expect(await events(deal.id)).toEqual([]);
    const version = current.version;
    await as(member, () => deals.moveStage(deal.id, { stageId: p.stages[1]!.id, version }, member));
    current = await get(deal.id);
    await as(member, () => deals.moveStage(deal.id, { stageId: p.stages[0]!.id, version: current.version }, member));
    const back = await get(deal.id);
    await expect(as(member, () => deals.moveStage(deal.id, { stageId: p.stages[1]!.id, version }, member))).rejects.toBeInstanceOf(EstadoInvalido);
    expect((await get(deal.id)).version).toBe(back.version); expect(await events(deal.id)).toHaveLength(2);
    await expect(as(outsider, () => deals.moveStage(deal.id, { stageId: p.stages[1]!.id, origin: "ficha", version: back.version }, outsider))).rejects.toBeInstanceOf(NaoEncontrado);
  });

  it("lote CAS é integral, preserva ordem e fixa origem; transferência/desfechos reutilizam caminho", async () => {
    const p = await pipeline(); const dest = await pipeline(); const a = await create(p); const b = await create(p);
    const a0 = await get(a.id); const b0 = await get(b.id);
    await expect(as(member, () => deals.bulk(bulkDealsRequestSchema.parse({ dealIds: [a.id, b.id], action: { type: "stage", stageId: p.stages[1]!.id }, versions: { [a.id]: a0.version, [b.id]: b0.version + 1 } }), member))).rejects.toBeInstanceOf(EstadoInvalido);
    expect((await get(a.id)).stageId).toBe(a0.stageId); expect(await events(a.id)).toEqual([]);
    await as(member, () => deals.bulk({ dealIds: [a.id, b.id], action: { type: "stage", stageId: p.stages[1]!.id }, versions: { [a.id]: a0.version, [b.id]: b0.version } }, member));
    expect((await events(a.id))[0]!.payload).toMatchObject({ origin: "lote" });
    const ordered = await as(member, () => deals.list({ pipelineId: p.id, status: "all" }, member));
    expect(ordered.deals.filter((d) => d.stageId === p.stages[1]!.id).map((d) => d.id)).toEqual([b.id, a.id]);
    const before = await get(a.id);
    await as(member, () => deals.transfer(a.id, { pipelineId: dest.id, stageId: dest.stages[0]!.id, convertToClient: false, version: before.version }, member));
    expect((await events(a.id)).at(-1)!.payload).toMatchObject({ origin: "transferencia", fromPipelineId: p.id, toPipelineId: dest.id });
    const moved = await get(a.id);
    await as(member, () => deals.win(a.id, { convertToClient: false, version: moved.version, origin: "ficha" }, member));
    const won = await db.eventLog.findFirstOrThrow({ where: { entityId: a.id, eventName: "commercial.deal.won" } });
    expect(won.payload).toMatchObject({ outcome: "won", origin: "ficha" });
    const other = await get(b.id);
    await as(member, () => deals.lose(b.id, { lossReasonId: p.lossReasons[0]!.id, version: other.version, origin: "quadro", note: "Evidência privada" }, member));
    const lost = await db.eventLog.findFirstOrThrow({ where: { entityId: b.id, eventName: "commercial.deal.lost" } });
    expect(lost.payload).toMatchObject({ outcome: "lost", origin: "quadro" }); expect(JSON.stringify(lost.payload)).not.toContain("Evidência");
  });

  it("falha de auditoria na segunda transição reverte lote, versões, histórias e eventos", async () => {
    const p = await pipeline(); const a = await create(p); const b = await create(p); const a0 = await get(a.id); const b0 = await get(b.id);
    const append = audit.append.bind(audit); let count = 0;
    const spy = vi.spyOn(audit, "append").mockImplementation((tx, event) => {
      if (event.eventName === "commercial.deal.stage_changed" && ++count === 2) throw new Error("Falha sintética de auditoria");
      return append(tx, event);
    });
    try {
      await expect(as(member, () => deals.bulk({ dealIds: [a.id, b.id], action: { type: "stage", stageId: p.stages[1]!.id } }, member))).rejects.toThrow("Falha sintética");
    } finally { spy.mockRestore(); }
    expect((await get(a.id)).version).toBe(a0.version); expect((await get(b.id)).version).toBe(b0.version);
    expect(await events(a.id)).toEqual([]); expect(await events(b.id)).toEqual([]);
    expect(await db.dealHistory.count({ where: { dealId: { in: [a.id, b.id] }, kind: "stage_changed" } })).toBe(0);
  });

  it("realocação com remoção de campo mantém UMA versão e preserva encerrados", async () => {
    const p = await pipeline(); const open = await create(p); const closed = await create(p);
    await as(member, () => deals.win(closed.id, { convertToClient: false }, member));
    const beforeOpen = await get(open.id); const beforeClosed = await get(closed.id);
    await as(manager, () => pipelines.update(p.id, updatePipelineRequestSchema.parse({ ...pipelineParaEdicao(p), fields: [], confirmedFieldRemovals: [p.fields![0]!.id], stages: pipelineParaEdicao(p).stages.slice(1), stageDestinations: { [p.stages[0]!.id]: p.stages[1]!.id } }), manager));
    const currentOpen = await get(open.id); const currentClosed = await get(closed.id);
    expect(currentOpen.version).toBe(beforeOpen.version + 1); expect(currentClosed.version).toBe(beforeClosed.version + 1);
    expect(currentClosed).toMatchObject({ status: "won", closedAt: beforeClosed.closedAt, stageEnteredAt: beforeClosed.stageEnteredAt });
    expect(currentOpen.customFields).toEqual({}); expect(currentClosed.customFields).toEqual({});
    expect((await events(open.id))[0]!.payload).toMatchObject({ origin: "configuracao" }); expect(await events(closed.id)).toEqual([]);
    expect(await db.dealHistory.count({ where: { dealId: open.id, kind: "stage_changed" } })).toBe(1);
    expect(await db.dealHistory.count({ where: { dealId: closed.id, kind: "stage_changed" } })).toBe(0);
  });

  it("dois comandos concorrentes com a mesma versão deixam só uma entrada/história/evento", async () => {
    const p = await pipeline(); const deal = await create(p); const before = await get(deal.id);
    const results = await Promise.allSettled(p.stages.slice(1).map((stage) => as(member, () => deals.moveStage(deal.id, { stageId: stage.id, version: before.version, origin: "api" }, member))));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected).toHaveLength(1); expect(rejected[0]!.reason).toBeInstanceOf(EstadoInvalido);
    expect((await get(deal.id)).version).toBe(before.version + 1);
    expect(await events(deal.id)).toHaveLength(1);
    expect(await db.dealHistory.count({ where: { dealId: deal.id, kind: "stage_changed" } })).toBe(1);
  });

  it("falha do evento na realocação reverte também configuração e remoção de valores", async () => {
    const p = await pipeline(); const deal = await create(p); const before = await get(deal.id);
    const configBefore = await db.pipeline.findUniqueOrThrow({ where: { id: p.id } });
    const appendMany = audit.appendMany.bind(audit);
    const spy = vi.spyOn(audit, "appendMany").mockImplementation(async (tx, batch) => {
      await appendMany(tx, batch);
      if (batch.some((event) => event.eventName === "commercial.deal.stage_changed")) throw new Error("Falha sintética na realocação");
    });
    try {
      await expect(as(manager, () => pipelines.update(p.id, updatePipelineRequestSchema.parse({ ...pipelineParaEdicao(p), fields: [], confirmedFieldRemovals: [p.fields![0]!.id], stages: pipelineParaEdicao(p).stages.slice(1), stageDestinations: { [p.stages[0]!.id]: p.stages[1]!.id } }), manager))).rejects.toThrow("Falha sintética");
    } finally { spy.mockRestore(); }
    expect(await get(deal.id)).toEqual(before);
    expect(await db.pipeline.findUniqueOrThrow({ where: { id: p.id } })).toEqual(configBefore);
    expect(await db.pipelineStage.count({ where: { pipelineId: p.id } })).toBe(3);
    expect(await events(deal.id)).toEqual([]);
    expect(await db.dealHistory.count({ where: { dealId: deal.id, kind: "stage_changed" } })).toBe(0);
  });

  it("evento inválido no fim do lote reverte negócios, campos, configuração e histórias", async () => {
    const p = await pipeline(); const a = await create(p); const b = await create(p);
    const before = await Promise.all([get(a.id), get(b.id)]);
    const historyBefore = await db.dealHistory.findMany({ where: { dealId: { in: [a.id, b.id] } }, orderBy: { id: "asc" } });
    const configBefore = await db.pipeline.findUniqueOrThrow({ where: { id: p.id } });
    const appendMany = audit.appendMany.bind(audit);
    const spy = vi.spyOn(audit, "appendMany").mockImplementation((tx, batch) => appendMany(tx, [
      ...batch, { ...batch[0]!, payload: { ref: "contato-sintetico@teste.local" } },
    ]));
    try {
      await expect(as(manager, () => pipelines.update(p.id, updatePipelineRequestSchema.parse({
        ...pipelineParaEdicao(p), fields: [], confirmedFieldRemovals: [p.fields![0]!.id], stages: pipelineParaEdicao(p).stages.slice(1), stageDestinations: { [p.stages[0]!.id]: p.stages[1]!.id },
      }), manager))).rejects.toBeInstanceOf(PayloadDeAuditoriaInvalido);
    } finally { spy.mockRestore(); }
    expect(await Promise.all([get(a.id), get(b.id)])).toEqual(before);
    expect(await db.pipeline.findUniqueOrThrow({ where: { id: p.id } })).toEqual(configBefore);
    expect(await db.dealHistory.findMany({ where: { dealId: { in: [a.id, b.id] } }, orderBy: { id: "asc" } })).toEqual(historyBefore);
    expect(await events(a.id)).toEqual([]); expect(await events(b.id)).toEqual([]);
  });

  it("configurações concorrentes de pipelines com campos cruzados mantêm ordem global dos locks", async () => {
    const a = await pipeline(); const b = await pipeline();
    const d1 = await create(a); const d2 = await create(b);
    const values = { [a.fields![0]!.id]: "Preservado A", [b.fields![0]!.id]: "Preservado B" };
    // Estado permitido após transferências: cada negócio preserva campos dos dois funis.
    for (const deal of [d1, d2]) await db.deal.update({ where: { id: deal.id }, data: { customFields: values } });
    const before = await Promise.all([get(d1.id), get(d2.id)]);
    const affected = new Set([d1.id, d2.id]);
    let arrivals = 0; let release!: () => void;
    const bothPartialLocks = new Promise<void>((resolve) => { release = resolve; });
    class BarrierPrisma extends PrismaService {
      override comContexto<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        return super.comContexto(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '2500ms'");
          const locked = new Set<string>();
          const instrumented = new Proxy(tx, { get(target, property) {
            if (property !== "$queryRaw") return Reflect.get(target, property);
            return async <R>(query: TemplateStringsArray | Prisma.Sql, ...params: unknown[]): Promise<R> => {
              const result = await tx.$queryRaw<R>(query, ...params);
              const sql = "strings" in query ? query.strings.join(" ") : Array.from(query).join(" ");
              if (sql.includes("FOR UPDATE") && Array.isArray(result)) {
                for (const row of result) if (row && typeof row === "object" && "id" in row && typeof row.id === "string" && affected.has(row.id)) locked.add(row.id);
                // Força o ciclo antigo quando a limpeza já bloqueou só metade
                // da união. Um prelock completo não precisa aguardar a barreira.
                if (sql.includes("custom_fields") && locked.size < affected.size) {
                  if (++arrivals === 2) release();
                  await bothPartialLocks;
                }
              }
              return result;
            };
          } });
          return fn(instrumented);
        });
      }
    }
    const instrumented = new BarrierPrisma();
    try {
      const repo = new PrismaPipelinesRepository(instrumented, audit);
      const results = await Promise.allSettled([a, b].map((p) => as(manager, () => repo.update(p.id, updatePipelineRequestSchema.parse({
        ...pipelineParaEdicao(p), fields: [], confirmedFieldRemovals: [p.fields![0]!.id], stages: pipelineParaEdicao(p).stages.slice(1), stageDestinations: { [p.stages[0]!.id]: p.stages[1]!.id },
      }), manager))));
      expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    } finally { await instrumented.$disconnect(); }
    for (const [index, deal] of [d1, d2].entries()) {
      const current = await get(deal.id);
      // Cada configuração remove seu campo; só a dona também realoca a etapa.
      expect(current.version).toBe(before[index]!.version + 2);
      expect(current.customFields).toEqual({});
      expect(await events(deal.id)).toHaveLength(1);
    }
  });

  it("leitura RLS por tela preserva outros responsáveis, nega Cliente-only e respeita revogação", async () => {
    const p = await pipeline(); const deal = await create(p);
    const otherMember = await person("membro"); const clientOnly = await person("membro", "client");
    const runtime = new RuntimePrisma();
    const countFor = (actor: AuthPrincipal) => as(actor, () => runtime.comContexto((tx) => tx.deal.count({ where: { id: deal.id } })));
    try {
      expect(otherMember.id).not.toBe(deal.owner.id);
      expect(await countFor(otherMember)).toBe(1);
      expect(await countFor(clientOnly)).toBe(0);
      expect(await countFor(outsider)).toBe(0);
      await db.user.update({ where: { id: otherMember.id }, data: { departamentos: { updateMany: { where: { departamento: "crm" }, data: { telas: [] } } } } });
      expect(await countFor(otherMember)).toBe(0);
    } finally { await runtime.$disconnect(); }
  });

  it("realoca mais de mil negócios na mesma transação sem ampliar orçamento ou perder auditoria", async () => {
    const p = await pipeline();
    const ids: string[] = Array.from({ length: 1001 }, () => randomUUID());
    const closedIds = ids.slice(0, 10);
    await db.deal.createMany({ data: ids.map((id, index) => ({
      id, pipelineId: p.id, stageId: p.stages[0]!.id, ownerId: member.id, title: `${prefix} Configuração em massa`,
      status: index < 10 ? "won" as const : "open" as const, closedAt: index < 10 ? new Date("2026-10-01T12:00:00Z") : null,
      stageEnteredAt: new Date("2026-10-01T10:00:00Z"), customFields: { [p.fields![0]!.id]: "Valor privado sintético" },
    })) });
    const runtime = new RuntimePrisma();
    try {
      const repository = new PrismaPipelinesRepository(runtime, audit);
      await as(manager, () => repository.update(p.id, updatePipelineRequestSchema.parse({ ...pipelineParaEdicao(p), fields: [], confirmedFieldRemovals: [p.fields![0]!.id], stages: pipelineParaEdicao(p).stages.slice(1), stageDestinations: { [p.stages[0]!.id]: p.stages[1]!.id } }), manager));
    } finally { await runtime.$disconnect(); }
    const stored = await db.deal.findMany({ where: { id: { in: ids } } });
    expect(stored).toHaveLength(ids.length);
    expect(stored.every((deal) => deal.stageId === p.stages[1]!.id && deal.version === 2 && JSON.stringify(deal.customFields) === "{}")).toBe(true);
    expect(stored.filter((deal) => closedIds.includes(deal.id)).every((deal) => deal.status === "won" && deal.stageEnteredAt.toISOString() === "2026-10-01T10:00:00.000Z" && deal.closedAt?.toISOString() === "2026-10-01T12:00:00.000Z")).toBe(true);
    const history = await db.dealHistory.findMany({ where: { dealId: { in: ids }, kind: "stage_changed" } });
    const auditRows = await db.eventLog.findMany({ where: { entityId: { in: ids }, eventName: "commercial.deal.stage_changed" } });
    expect(history).toHaveLength(991); expect(auditRows).toHaveLength(991);
    expect(new Set(history.map((row) => row.occurredAt.toISOString())).size).toBe(1);
    const historyIds = new Set(history.map((row) => row.id));
    expect(auditRows.every((row) => row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) && historyIds.has(String(row.payload.transitionId)))).toBe(true);
  });
});
