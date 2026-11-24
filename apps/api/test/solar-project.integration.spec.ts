import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDealRequestSchema, createPipelineRequestSchema, pipelineParaEdicao, updateLeadRequestSchema, updatePipelineRequestSchema,
  type DealSolarProject, type Pipeline, type PipelineFieldInput, type PipelineProcessProfile,
} from "@plugga/shared";

import { AuditAppender } from "../src/audit/audit-appender";
import { ClientesService } from "../src/clientes/clientes.service";
import { PrismaClientesRepository } from "../src/clientes/prisma-clientes.repository";
import { AcessoNegado, EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../src/common/errors/dominio";
import type { AuthPrincipal } from "../src/core/auth/auth.types";
import { PrismaNegociosRepository } from "../src/negocios/prisma-negocios.repository";
import { PrismaPipelinesRepository } from "../src/pipelines/prisma-pipelines.repository";
import { contextoBanco } from "../src/prisma/contexto-banco";
import { PrismaService } from "../src/prisma/prisma.service";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

const enabled = process.env.RUN_NEGOCIOS_INTEGRATION_TESTS === "true";
describe.skipIf(!enabled)("ficha Solar prospectiva: persistência, referências, isolamento e histórico", { timeout: 60_000 }, () => {
  const db = new PrismaService();
  const audit = new AuditAppender();
  const pipelines = new PrismaPipelinesRepository(db, audit);
  const deals = new PrismaNegociosRepository(db, audit, new ClientesService(new PrismaClientesRepository(db, audit)));
  const prefix = `solar-${randomUUID().slice(0, 8)}`;
  const users: { principal: AuthPrincipal; sessionHash: string }[] = [];
  let manager: AuthPrincipal;
  let member: AuthPrincipal;
  let outsider: AuthPrincipal;
  const as = <T>(actor: AuthPrincipal, fn: () => Promise<T>): Promise<T> => {
    const user = users.find((user) => user.principal.id === actor.id);
    if (!user) throw new Error("Ator sintético sem sessão.");
    return contextoBanco.run({ sessionHash: user.sessionHash }, fn);
  };
  async function person(level: "gerente" | "membro", screen = true) {
    const user = await db.user.create({ data: {
      name: `${prefix} Pessoa ${users.length}`, email: `${prefix}-${users.length}@teste.local`,
      departamentos: { create: { departamento: "crm", nivel: level, telas: screen ? ["crm.pipelines"] : [] } },
    } });
    const principal: AuthPrincipal = { id: user.id, kind: "user", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: level, telas: screen ? ["crm.pipelines"] : [] }] } };
    const sessionHash = randomBytes(32).toString("hex");
    await db.session.create({ data: { userId: user.id, tokenHash: sessionHash, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
    users.push({ principal, sessionHash });
    return principal;
  }
  async function pipeline(withFields = false) {
    const fields: PipelineFieldInput[] = withFields ? ["installationType", "averageConsumptionKwh", "roofType", "availableAreaM2", "estimatedPowerKwp"].map((name) => ({
      name, type: name === "installationType" || name === "roofType" ? "select" : "number",
      options: name === "installationType" ? ["residential", "commercial", "rural"].map((name) => ({ name })) : name === "roofType" ? [{ name: "Livre" }] : [],
      showOnCard: false, showInList: false,
    })) : [];
    return as(manager, () => pipelines.create(createPipelineRequestSchema.parse({
      companyId: "plugga", name: `${prefix}-${randomUUID()}`, description: null, valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
      stages: [{ name: "Qualificação", color: "#0077FF", staleAfterDays: null, asksClientConversion: false }], tags: [], lossReasons: [], fields,
    }), manager));
  }
  const save = (p: Pipeline, input: Record<string, unknown>) => as(manager, () => pipelines.update(p.id, updatePipelineRequestSchema.parse({ ...pipelineParaEdicao(p), ...input }), manager));
  async function associate(p: Pipeline) {
    const [installation, consumption, roof, area, power] = p.fields!;
    const profile: PipelineProcessProfile = { key: "solar_commercial", version: 1, bindings: {
      installationType: { fieldId: installation!.id, options: { residential: installation!.options[0]!.id, commercial: installation!.options[1]!.id, rural: installation!.options[2]!.id } },
      averageConsumptionKwh: { fieldId: consumption!.id }, roofType: { fieldId: roof!.id }, availableAreaM2: { fieldId: area!.id }, estimatedPowerKwp: { fieldId: power!.id },
    } };
    return save(p, { processProfile: profile });
  }
  const solar = async () => associate(await pipeline(true));
  const project = (): DealSolarProject => ({ principalUc: { code: "000-PRIVADA" }, beneficiaryUcs: [{ id: randomUUID(), code: "BENEFICIARIA-PRIVADA" }], primaryEnergyBillDocumentId: null });
  const create = (p: Pipeline, solarProject?: DealSolarProject) => as(member, () => deals.create(createDealRequestSchema.parse({
    pipelineId: p.id, stageId: p.stages[0]!.id, title: `${prefix} Negócio`, ownerId: member.id,
    lead: { personType: "pj", name: `${prefix} Lead`, phone: "92999990000" }, ...(solarProject ? { solarProject } : {}),
  }), member));
  const get = (id: string) => as(member, () => deals.get(id, member));
  async function document(dealId: string) {
    return db.leadDocument.create({ data: {
      dealId, category: "conta_de_energia", originalName: "CONTA-PRIVADA.pdf", safeName: "conta.pdf", detectedMime: "application/pdf", sizeBytes: 10,
      storageBucket: "solar-teste", storageKey: `${prefix}/${randomUUID()}`, sha256: randomBytes(32).toString("hex"), uploadState: "ready", uploadedById: member.id,
    } });
  }
  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    await db.$connect();
    await db.company.upsert({ where: { id: "plugga" }, create: { id: "plugga", name: "Plugga" }, update: {} });
    manager = await person("gerente"); member = await person("membro"); outsider = await person("membro", false);
  });
  afterAll(async () => {
    const ids = (await db.deal.findMany({ where: { title: { startsWith: prefix } }, select: { id: true } })).map((d) => d.id);
    await db.leadDocument.deleteMany({ where: { dealId: { in: ids } } });
    await db.deal.deleteMany({ where: { id: { in: ids } } });
    await db.client.deleteMany({ where: { name: { startsWith: prefix } } });
    await db.pipeline.deleteMany({ where: { name: { startsWith: prefix } } });
    await db.session.deleteMany({ where: { userId: { in: users.map((u) => u.principal.id) } } });
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("POST/detalhe persistem sem Cliente e lista omite UCs; edição conjunta incrementa uma vez", async () => {
    const p = await solar();
    const draft = project();
    const created = await create(p, draft);
    let current = await get(created.id);
    expect(current.solarProject).toEqual(draft);
    expect(current.client).toBeNull();
    expect((await db.deal.findUniqueOrThrow({ where: { id: created.id }, include: { consumerUnits: true } })).consumerUnits).toEqual([]);
    const listed = await as(member, () => deals.list({ pipelineId: p.id, status: "all" }, member));
    expect(listed.deals.find((d) => d.id === created.id)).not.toHaveProperty("solarProject");
    const oldVersion = current.version;
    current = await as(member, () => deals.update(created.id, updateLeadRequestSchema.parse({ version: oldVersion, solarProject: { ...draft, principalUc: { code: "NOVA-PRIVADA" }, beneficiaryUcs: [] }, customFields: { [p.processProfile!.bindings.averageConsumptionKwh.fieldId]: "0" }, lead: { notes: "nota privada" }, contact: { name: "Contato sintético", phone: "92999990000" } }), member));
    expect(current.version).toBe(oldVersion + 1);
    expect(current.stageId).toBe(p.stages[0]!.id);
    expect(current.solarProject?.beneficiaryUcs).toEqual([]);
    expect(current.customFields?.[p.processProfile!.bindings.averageConsumptionKwh.fieldId]).toBe("0");
    const history = await as(member, () => deals.history(created.id, { limit: 100 }, member));
    expect(history.entries).toContainEqual(expect.objectContaining({ field: "solar:principalUc", before: draft.principalUc!.code, after: "NOVA-PRIVADA" }));
    expect(history.entries).toContainEqual(expect.objectContaining({ field: "solar:beneficiaryUcs", before: [{ id: draft.beneficiaryUcs[0]!.id, name: draft.beneficiaryUcs[0]!.code }], after: [] }));
    await expect(as(member, () => deals.update(created.id, { version: oldVersion, solarProject: draft }, member))).rejects.toBeInstanceOf(EstadoInvalido);
    await expect(as(member, () => deals.update(created.id, { solarProject: draft }, member))).rejects.toBeInstanceOf(RequisicaoInvalida);
    const events = await db.eventLog.findMany({ where: { entityId: created.id }, select: { payload: true } });
    for (const value of ["000-PRIVADA", "BENEFICIARIA-PRIVADA", "NOVA-PRIVADA", "nota privada"]) expect(JSON.stringify(events)).not.toContain(value);
  });

  it("referência exige conta pronta do mesmo negócio e mantém referência arquivada inalterada", async () => {
    const p = await solar(); const deal = await create(p); const other = await create(p);
    const bill = await document(deal.id); const foreign = await document(other.id);
    let current = await get(deal.id);
    expect(current.solarProject).toBeNull();
    const draft = { ...project(), primaryEnergyBillDocumentId: bill.id };
    current = await as(member, () => deals.update(deal.id, { version: current.version, solarProject: draft }, member));
    expect(current.solarProject).toEqual(draft);
    await expect(as(member, () => deals.update(deal.id, { version: current.version, title: "Não gravar", solarProject: { ...draft, primaryEnergyBillDocumentId: foreign.id } }, member))).rejects.toBeInstanceOf(RequisicaoInvalida);
    expect((await get(deal.id)).version).toBe(current.version);
    for (const change of [{ uploadState: "pending" as const }, { uploadState: "ready" as const, category: "outros" as const }, { category: "conta_de_energia" as const, archivedAt: new Date() }]) {
      await db.leadDocument.update({ where: { id: foreign.id }, data: change });
      // Mesmo documento do negócio, mas não utilizável para NOVA seleção.
      const ownInvalid = await document(deal.id);
      await db.leadDocument.update({ where: { id: ownInvalid.id }, data: change });
      await expect(as(member, () => deals.update(deal.id, { version: current.version, solarProject: { ...draft, primaryEnergyBillDocumentId: ownInvalid.id } }, member))).rejects.toBeInstanceOf(RequisicaoInvalida);
    }
    await db.leadDocument.update({ where: { id: bill.id }, data: { archivedAt: new Date(), category: "outros" } });
    current = await as(member, () => deals.update(deal.id, { version: current.version, solarProject: { ...draft, beneficiaryUcs: [] } }, member));
    expect(current.solarProject?.primaryEnergyBillDocumentId).toBe(bill.id);
    const history = await as(member, () => deals.history(deal.id, { limit: 100 }, member));
    expect(history.entries).toContainEqual(expect.objectContaining({ field: "solar:primaryEnergyBillDocumentId", after: { id: bill.id, name: "CONTA-PRIVADA.pdf" } }));
    expect(JSON.stringify(await db.eventLog.findMany({ where: { entityId: deal.id }, select: { payload: true } }))).not.toContain("CONTA-PRIVADA");
  });

  it("associação imutável preserva omissão, rename/reorder e recusa binding pendurado sem valores", async () => {
    let p = await solar(); const profile = p.processProfile;
    await expect(save(p, { processProfile: null })).rejects.toBeInstanceOf(RequisicaoInvalida);
    await expect(save(p, { fields: [] })).rejects.toBeInstanceOf(RequisicaoInvalida);
    const fields = pipelineParaEdicao(p).fields!;
    await expect(save(p, { fields: fields.map((f) => f.id === profile!.bindings.installationType.fieldId ? { ...f, options: f.options!.slice(1) } : f) })).rejects.toBeInstanceOf(RequisicaoInvalida);
    p = await save(p, { name: `${prefix}-renomeado-${randomUUID().slice(0, 8)}`, processProfile: undefined, fields: fields.map((f, i) => ({ ...f, name: `Outro ${i}`, options: f.options?.map((o, j) => ({ ...o, name: `Renomeada ${j}` })) })).reverse() });
    expect(p.processProfile).toEqual(profile);
    await expect(as(member, () => pipelines.update(p.id, pipelineParaEdicao(p), member))).rejects.toBeInstanceOf(AcessoNegado);
  });

  it("transferência preserva ficha sem exposição/escrita no genérico e recupera no retorno", async () => {
    const origin = await solar(); const dest = await pipeline(); const draft = project(); const deal = await create(origin, draft);
    await as(member, () => deals.transfer(deal.id, { pipelineId: dest.id, stageId: dest.stages[0]!.id, convertToClient: false }, member));
    const current = await get(deal.id);
    expect(current).not.toHaveProperty("solarProject");
    await expect(as(member, () => deals.update(deal.id, { version: current.version, solarProject: draft }, member))).rejects.toBeInstanceOf(RequisicaoInvalida);
    await expect(create(dest, draft)).rejects.toBeInstanceOf(RequisicaoInvalida);
    await as(member, () => deals.transfer(deal.id, { pipelineId: origin.id, stageId: origin.stages[0]!.id, convertToClient: false }, member));
    expect((await get(deal.id)).solarProject).toEqual(draft);
  });

  it("acesso de pipeline dispensa crm.clientes e RLS oculta ficha de quem perdeu a tela", async () => {
    const p = await solar(); const deal = await create(p, project());
    await expect(as(outsider, () => deals.get(deal.id, outsider))).rejects.toBeInstanceOf(NaoEncontrado);
    const current = await get(deal.id);
    await expect(as(outsider, () => deals.update(deal.id, { version: current.version, solarProject: project() }, outsider))).rejects.toBeInstanceOf(NaoEncontrado);
    const rows = await as(outsider, () => db.comContexto(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime");
      const updated = await tx.deal.updateMany({ where: { id: deal.id }, data: { solarProject: project() } });
      expect(updated.count).toBe(0);
      return tx.deal.findMany({ where: { id: deal.id }, select: { solarProject: true } });
    }));
    expect(rows).toEqual([]);
  });

  it("associação não reinterpreta encerrados e edição prospectiva preserva Cliente/UC e histórico legados", async () => {
    const p = await pipeline(true);
    const deal = await create(p);
    const client = await db.client.create({ data: { name: `${prefix} Cliente legado` } });
    const unit = await db.consumerUnit.create({ data: { clientId: client.id, code: "CANONICA-ORIGINAL", distributor: "Distribuidora sintética" } });
    const closedAt = new Date();
    await db.deal.update({ where: { id: deal.id }, data: { clientId: client.id, status: "won", closedAt } });
    await db.dealConsumerUnit.create({ data: { dealId: deal.id, consumerUnitId: unit.id } });
    const before = await get(deal.id);
    await associate(p);
    let current = await get(deal.id);
    expect(current).toMatchObject({ version: before.version, status: "won", closedAt: closedAt.toISOString(), solarProject: null });
    current = await as(member, () => deals.update(deal.id, { version: current.version, solarProject: project() }, member));
    expect(current).toMatchObject({ status: "won", closedAt: closedAt.toISOString() });
    const persisted = await db.deal.findUniqueOrThrow({ where: { id: deal.id }, include: { consumerUnits: true } });
    expect(persisted.clientId).toBe(client.id);
    expect(persisted.consumerUnits).toEqual([{ dealId: deal.id, consumerUnitId: unit.id }]);
    expect(await db.client.findUniqueOrThrow({ where: { id: client.id } })).toEqual(client);
    expect(await db.consumerUnit.findUniqueOrThrow({ where: { id: unit.id } })).toEqual(unit);
    const history = await as(member, () => deals.history(deal.id, { limit: 100 }, member));
    expect(history.entries.filter((entry) => ["won", "client_converted", "transferred"].includes(entry.kind))).toEqual([]);
    expect(history.entries.some((entry) => entry.kind === "created")).toBe(true);
  });

  it("catálogo maior que um lote preserva arquivados, ordem e contagens sob runtime/RLS real", async () => {
    const definitions = [];
    for (let index = 0; index < 31; index++) {
      const fieldId = randomUUID();
      const p = await db.pipeline.create({ data: {
        name: `${prefix}-catalogo-${index}`, companyId: "plugga", createdAt: new Date(Date.now() + index), archivedAt: index ? new Date() : null,
        valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
        fields: [{ id: fieldId, name: "Texto", type: "text", options: [], showOnCard: false, showInList: false, position: 0, valueCount: 0 }],
        stages: { create: [0, 1].map((position) => ({ name: `Etapa ${position}`, position, color: "#0077FF" })) },
      }, include: { stages: { orderBy: { position: "asc" } } } });
      definitions.push({ ...p, fieldId });
    }
    await db.deal.createMany({ data: definitions.flatMap((p) => ([
      { pipelineId: p.id, stageId: p.stages[0]!.id, ownerId: member.id, title: `${prefix} Catálogo aberto`, status: "open" as const, customFields: { [p.fieldId]: "Valor sintético" } },
      { pipelineId: p.id, stageId: p.stages[1]!.id, ownerId: member.id, title: `${prefix} Catálogo ganho`, status: "won" as const, customFields: { [p.fieldId]: "Outro valor sintético" } },
      { pipelineId: p.id, stageId: p.stages[1]!.id, ownerId: member.id, title: `${prefix} Catálogo perdido`, status: "lost" as const, customFields: {} },
    ])) });
    class RuntimePrisma extends PrismaService {
      override comContexto<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        return super.comContexto(async (tx) => {
          await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime");
          return fn(tx);
        });
      }
    }
    const runtime = new RuntimePrisma();
    try {
      const repo = new PrismaPipelinesRepository(runtime, audit);
      const result = await as(member, () => repo.list(member));
      const fixtureIds = new Set(definitions.map((p) => p.id));
      const found = result.pipelines.filter((p) => fixtureIds.has(p.id));
      expect(found.map((p) => p.id)).toEqual(definitions.map((p) => p.id));
      expect(found.map((p) => p.archivedAt !== null)).toEqual(definitions.map((p) => p.archivedAt !== null));
      for (const p of found) {
        expect(p.dealCount).toBe(3);
        expect(p.stages.map((s) => s.dealCount)).toEqual([1, 2]);
        expect(p.fields?.[0]?.valueCount).toBe(2);
        expect(p.canConfigure).toBe(false);
      }
      await expect(as(outsider, () => repo.list(outsider))).rejects.toBeInstanceOf(AcessoNegado);
    } finally {
      await runtime.$disconnect();
    }
  });
});
