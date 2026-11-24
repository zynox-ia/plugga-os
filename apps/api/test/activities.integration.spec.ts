import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  completeActivityRequestSchema, createActivityRequestSchema, listActivitiesQuerySchema,
  type Activity, type ActivityTarget,
} from "@plugga/shared";
import { PrismaAtividadesRepository } from "../src/atividades/prisma-atividades.repository";
import { AcessoNegado, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../src/common/errors/dominio";
import type { AuthPrincipal } from "../src/core/auth/auth.types";
import { contextoBanco } from "../src/prisma/contexto-banco";
import { PrismaService } from "../src/prisma/prisma.service";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

class RuntimePrisma extends PrismaService {
  failHistory = false;
  override comContexto<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return super.comContexto(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime");
      if (!this.failHistory) return fn(tx);
      // Falha após escritas reais: comprova rollback, sem alterar o schema de teste.
      return fn(new Proxy(tx, { get(target, key) {
        if (key !== "activityChange") return Reflect.get(target, key);
        return new Proxy(target.activityChange, { get(delegate, property) {
          if (property === "create") return () => { throw new Error("falha sintética de histórico"); };
          return Reflect.get(delegate, property);
        } });
      } }));
    });
  }
}

describe.skipIf(process.env.RUN_ACTIVITIES_INTEGRATION_TESTS !== "true")("atividades: PostgreSQL runtime, CAS e atomicidade", { timeout: 30_000 }, () => {
  const db = new PrismaService();
  const runtime = new RuntimePrisma();
  const repo = new PrismaAtividadesRepository(runtime);
  const prefix = `activities-${randomUUID().slice(0, 8)}`;
  const users: { principal: AuthPrincipal; sessionHash: string }[] = [];
  let member: AuthPrincipal; let manager: AuthPrincipal; let outsider: AuthPrincipal; let clientOnly: AuthPrincipal;
  let dealId: string; let otherDealId: string; let clientId: string; let pipelineId: string;
  const as = <T>(actor: AuthPrincipal, fn: () => Promise<T>) => contextoBanco.run({ sessionHash: users.find((u) => u.principal.id === actor.id)!.sessionHash }, fn);
  async function person(level: "membro" | "gerente", screens: string[]) {
    const user = await db.user.create({ data: { name: `${prefix} pessoa`, email: `${prefix}-${users.length}@teste.local`,
      departamentos: { create: { departamento: "crm", nivel: level, telas: screens } } } });
    const principal: AuthPrincipal = { id: user.id, kind: "user", acesso: { plataforma: null, departamentos: [] } };
    const sessionHash = randomBytes(32).toString("hex");
    await db.session.create({ data: { userId: user.id, tokenHash: sessionHash, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
    users.push({ principal, sessionHash }); return principal;
  }
  const schedule = () => ({ ownerId: member.id, startsAt: "2026-11-09T13:00:00Z", dueAt: "2026-11-09T13:00:00Z" });
  const input = (target: ActivityTarget = { kind: "deal", dealId: dealId }) => createActivityRequestSchema.parse({
    requestId: randomUUID(), target, type: "call", title: `${prefix} Contato`, ...schedule(),
  });
  const create = () => as(member, () => repo.create(input(), member));
  const done = (activity: Activity, next = false, documentIds: string[] = []) => completeActivityRequestSchema.parse({
    version: activity.version, roundId: activity.currentRound.id, outcome: { summary: "Contato confirmou a próxima conversa", documentIds },
    ...(next ? { nextAction: { type: "task", title: `${prefix} Próxima`, ...schedule() } } : {}),
  });
  async function document(id: string) {
    return db.leadDocument.create({ data: { dealId: id, category: "outros", originalName: "sintetico.pdf", safeName: "sintetico.pdf", detectedMime: "application/pdf", sizeBytes: 10,
      storageBucket: "activities-test", storageKey: randomUUID(), sha256: randomBytes(32).toString("hex"), uploadState: "ready" } });
  }
  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    await db.$connect(); await runtime.$connect();
    await db.company.upsert({ where: { id: "plugga" }, create: { id: "plugga", name: "Plugga" }, update: {} });
    member = await person("membro", ["crm.pipelines"]); manager = await person("gerente", ["crm.pipelines", "crm.clientes"]);
    outsider = await person("membro", []); clientOnly = await person("membro", ["crm.clientes"]);
    const pipeline = await db.pipeline.create({ data: { name: prefix, companyId: "plugga", valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
      stages: { create: [{ name: "Contato", color: "#0077FF", position: 0 }] } }, include: { stages: true } });
    pipelineId = pipeline.id;
    const createDeal = () => db.deal.create({ data: { title: prefix, pipelineId, stageId: pipeline.stages[0]!.id, ownerId: member.id } });
    dealId = (await createDeal()).id; otherDealId = (await createDeal()).id;
    clientId = (await db.client.create({ data: { name: prefix } })).id;
  });
  afterAll(async () => {
    runtime.failHistory = false;
    const ids = (await db.activity.findMany({ where: { title: { startsWith: prefix } }, select: { id: true } })).map((a) => a.id);
    const rounds = (await db.activityRound.findMany({ where: { activityId: { in: ids } }, select: { id: true } })).map((r) => r.id);
    await db.activityRoundEvidence.deleteMany({ where: { roundId: { in: rounds } } });
    await db.activityChange.deleteMany({ where: { activityId: { in: ids } } });
    await db.activityRound.deleteMany({ where: { activityId: { in: ids } } });
    await db.activity.deleteMany({ where: { id: { in: ids } } });
    await db.leadDocument.deleteMany({ where: { dealId: { in: [dealId, otherDealId].filter(Boolean) } } });
    await db.deal.deleteMany({ where: { title: prefix } });
    if (pipelineId) await db.pipeline.delete({ where: { id: pipelineId } });
    if (clientId) await db.client.delete({ where: { id: clientId } });
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await runtime.$disconnect(); await db.$disconnect();
  });

  it("criação concorrente é idempotente, persiste sem Client e histórico não vaza para eventos", async () => {
    const draft = input();
    const [a, b] = await Promise.all([as(member, () => repo.create(draft, member)), as(member, () => repo.create(draft, member))]);
    expect(a.id).toBe(b.id); expect(a.currentRound.status).toBe("todo");
    expect(a.currentRound.startsAt).toBe(a.currentRound.dueAt);
    expect(await as(member, () => new PrismaAtividadesRepository(runtime).get(a.id, member))).toEqual(a);
    expect((await db.deal.findUniqueOrThrow({ where: { id: dealId } })).clientId).toBeNull();
    expect(await db.activityRound.count({ where: { activityId: a.id } })).toBe(1);
    expect(await db.activityChange.count({ where: { activityId: a.id } })).toBe(1);
    await expect(as(member, () => repo.create({ ...draft, title: "Outra intenção" }, member))).rejects.toBeInstanceOf(EstadoInvalido);
    expect(await db.eventLog.count({ where: { entityId: a.id } })).toBe(0);
  });

  it("CAS concorrente admite uma atualização, e target mostra responsáveis diferentes", async () => {
    const a = await create();
    const results = await Promise.allSettled([
      as(member, () => repo.update(a.id, { version: a.version, status: "doing" }, member)),
      as(member, () => repo.update(a.id, { version: a.version, notes: "Outro comando" }, member)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const current = await as(member, () => repo.get(a.id, member)); expect(current.version).toBe(a.version + 1);
    await as(manager, () => repo.create({ ...input(), ownerId: manager.id }, manager));
    const list = await as(member, () => repo.list(listActivitiesQuerySchema.parse({ scope: "target", dealId }), member));
    expect(list.activities.some((x) => x.currentRound.ownerId === manager.id)).toBe(true);
    await expect(as(member, () => repo.list(listActivitiesQuerySchema.parse({ scope: "team" }), member))).rejects.toBeInstanceOf(AcessoNegado);
  });

  it("conclusões concorrentes geram uma próxima ação e encerramento preserva histórico", async () => {
    const a = await create();
    const results = await Promise.allSettled([as(member, () => repo.complete(a.id, done(a, true), member)), as(member, () => repo.complete(a.id, done(a, true), member))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const current = await as(member, () => repo.get(a.id, member));
    expect(current.currentRound).toMatchObject({ status: "done", endReason: "completed", completedBy: { id: member.id, type: "user" } });
    expect(current.currentRound.nextActivityId).toBeTruthy();
    const history = await as(member, () => repo.history(a.id, { limit: 30 }, member));
    expect(history.entries.map((e) => e.kind)).toEqual(["created", "completed"]);
    expect(history.entries[0]!.snapshot.currentRound.status).toBe("todo");
    await expect(as(member, () => repo.update(a.id, { version: current.version, notes: "Apagar passado" }, member))).rejects.toBeInstanceOf(EstadoInvalido);
    await expect(as(member, () => runtime.comContexto((tx) => tx.activityRound.update({ where: { id: current.currentRound.id }, data: { dueAt: new Date() } })))).rejects.toThrow();
    await expect(as(member, () => runtime.comContexto((tx) => tx.activityChange.updateMany({ where: { activityId: a.id }, data: { kind: "updated" } })))).rejects.toThrow();
  });

  it("falha depois da escrita da próxima atividade reverte toda a conclusão", async () => {
    const a = await create(); const beforeCount = await db.activity.count({ where: { dealId } });
    runtime.failHistory = true;
    try { await expect(as(member, () => repo.complete(a.id, done(a, true), member))).rejects.toThrow("falha sintética"); }
    finally { runtime.failHistory = false; }
    expect(await as(member, () => repo.get(a.id, member))).toEqual(a);
    expect(await db.activity.count({ where: { dealId } })).toBe(beforeCount);
  });

  it("evidência exige documento utilizável do mesmo Deal e RLS é real nos filhos", async () => {
    const a = await create(); const own = await document(dealId); const foreign = await document(otherDealId);
    await expect(as(member, () => repo.complete(a.id, done(a, false, [foreign.id]), member))).rejects.toBeInstanceOf(RequisicaoInvalida);
    await expect(as(member, () => runtime.comContexto((tx) => tx.activityRoundEvidence.create({ data: { roundId: a.currentRound.id, leadDocumentId: foreign.id } })))).rejects.toThrow();
    await db.leadDocument.update({ where: { id: own.id }, data: { archivedAt: new Date() } });
    await expect(as(member, () => repo.complete(a.id, done(a, false, [own.id]), member))).rejects.toBeInstanceOf(RequisicaoInvalida);
    await db.leadDocument.update({ where: { id: own.id }, data: { archivedAt: null } });
    const completed = await as(member, () => repo.complete(a.id, done(a, false, [own.id]), member));
    expect(completed.activity.currentRound.outcome?.documentIds).toEqual([own.id]);
    const lateOwnDocument = await document(dealId);
    await expect(as(member, () => runtime.comContexto((tx) => tx.activityRoundEvidence.create({ data: { roundId: a.currentRound.id, leadDocumentId: lateOwnDocument.id } })))).rejects.toThrow();
    await expect(as(member, () => runtime.comContexto((tx) => tx.activityRoundEvidence.deleteMany({ where: { roundId: a.currentRound.id } })))).rejects.toThrow();
    await expect(as(outsider, () => repo.get(a.id, outsider))).rejects.toBeInstanceOf(NaoEncontrado);
    const invisible = await as(outsider, () => runtime.comContexto(async (tx) => ({
      roots: await tx.activity.findMany({ where: { id: a.id } }), rounds: await tx.activityRound.findMany({ where: { activityId: a.id } }),
      history: await tx.activityChange.findMany({ where: { activityId: a.id } }), evidence: await tx.activityRoundEvidence.findMany({ where: { roundId: a.currentRound.id } }),
    })));
    expect(Object.values(invisible).every((rows) => rows.length === 0)).toBe(true);
  });

  it("alvo Client respeita sua tela, sem acesso a Deal ou criação de cadastro", async () => {
    const draft = { ...input({ kind: "client", clientId }), ownerId: clientOnly.id };
    await expect(as(member, () => repo.create(draft, member))).rejects.toBeInstanceOf(NaoEncontrado);
    const a = await as(clientOnly, () => repo.create(draft, clientOnly));
    expect(a.target).toEqual({ kind: "client", clientId });
    const dealActivity = await create();
    await expect(as(clientOnly, () => repo.get(dealActivity.id, clientOnly))).rejects.toBeInstanceOf(NaoEncontrado);
    await expect(as(member, () => repo.create({ ...input(), ownerId: manager.id }, member))).rejects.toBeInstanceOf(AcessoNegado);
  });

  it("paginação do alvo é estável e acesso revogado não usa principal antigo", async () => {
    await create(); await create();
    const first = await as(member, () => repo.list(listActivitiesQuerySchema.parse({ scope: "target", dealId, limit: 1 }), member));
    expect(first.nextCursor).toBeTruthy();
    const next = await as(member, () => repo.list(listActivitiesQuerySchema.parse({ scope: "target", dealId, cursor: first.nextCursor, limit: 1 }), member));
    expect(next.activities[0]!.id).not.toBe(first.activities[0]!.id);
    const a = await as(manager, () => repo.create({ ...input(), ownerId: manager.id }, manager));
    await db.userDepartamento.update({ where: { userId_departamento: { userId: manager.id, departamento: "crm" } }, data: { telas: [] } });
    try { await expect(as(manager, () => repo.get(a.id, manager))).rejects.toBeInstanceOf(NaoEncontrado); }
    finally { await db.userDepartamento.update({ where: { userId_departamento: { userId: manager.id, departamento: "crm" } }, data: { telas: ["crm.pipelines", "crm.clientes"] } }); }
  });
});
