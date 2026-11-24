import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDealRequestSchema, createPipelineRequestSchema, pipelineParaEdicao,
  updateLeadRequestSchema, updatePipelineRequestSchema,
  type Pipeline, type PipelineField, type PipelineFieldInput,
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
describe.skipIf(!enabled)("campos personalizados: persistência, isolamento e histórico", { timeout: 60_000 }, () => {
  const db = new PrismaService();
  const audit = new AuditAppender();
  const pipelines = new PrismaPipelinesRepository(db, audit);
  const deals = new PrismaNegociosRepository(db, audit, new ClientesService(new PrismaClientesRepository(db, audit)));
  const prefix = `fields-${randomUUID().slice(0, 8)}`;
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
  const definition = (type: PipelineField["type"], name: string = type): PipelineFieldInput => ({
    name, type, options: type === "select" ? [{ name: "Primeira" }, { name: "Segunda" }] : [], showOnCard: true, showInList: true,
  });
  const field = (pipeline: Pipeline, type: PipelineField["type"]) => {
    const field = pipeline.fields?.find((field) => field.type === type);
    if (!field) throw new Error(`Campo sintético ausente: ${type}`);
    return field;
  };
  async function pipeline(fields: PipelineFieldInput[] = []) {
    return as(manager, () => pipelines.create(createPipelineRequestSchema.parse({
      companyId: "plugga", name: `${prefix}-${randomUUID()}`, description: null, valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
      stages: [{ name: "Entrada", color: "#0077FF", staleAfterDays: null, asksClientConversion: false }], tags: [], lossReasons: [], fields,
    }), manager));
  }
  const readPipeline = (id: string) => as(manager, async () => {
    const value = (await pipelines.list(manager)).pipelines.find((pipeline) => pipeline.id === id);
    if (!value) throw new Error("Pipeline sintético ausente.");
    return value;
  });
  const save = (pipeline: Pipeline, input: Record<string, unknown>) => as(manager, () => pipelines.update(pipeline.id, updatePipelineRequestSchema.parse({ ...pipelineParaEdicao(pipeline), ...input }), manager));
  const create = (pipeline: Pipeline, customFields: Record<string, string | boolean | null> = {}) => as(member, () => deals.create(createDealRequestSchema.parse({
    pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, title: `${prefix} Negócio`, ownerId: member.id,
    lead: { personType: "pj", name: `${prefix} Lead`, phone: "92999990000" }, customFields,
  }), member));
  const get = (id: string) => as(member, () => deals.get(id, member));
  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    await db.$connect();
    await db.company.upsert({ where: { id: "plugga" }, create: { id: "plugga", name: "Plugga" }, update: {} });
    manager = await person("gerente"); member = await person("membro"); outsider = await person("membro", false);
  });
  afterAll(async () => {
    await db.deal.deleteMany({ where: { title: { startsWith: prefix } } });
    await db.pipeline.deleteMany({ where: { name: { startsWith: prefix } } });
    await db.session.deleteMany({ where: { userId: { in: users.map((user) => user.principal.id) } } });
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.$disconnect();
  });

  it("gera identidade, preserva false/zero e roundtrip legado omite sem apagar", async () => {
    let p = await pipeline([definition("boolean"), definition("number"), definition("text")]);
    const bool = field(p, "boolean").id; const num = field(p, "number").id; const text = field(p, "text").id;
    const deal = await create(p, { [bool]: false, [num]: "000.000", [text]: "Contato privado" });
    expect(deal.customFields).toEqual({ [bool]: false, [num]: "0", [text]: "Contato privado" });
    p = await readPipeline(p.id);
    expect(p.fields?.map((field) => field.valueCount)).toEqual([1, 1, 1]);
    const legacy = pipelineParaEdicao(p); delete legacy.fields;
    p = await as(manager, () => pipelines.update(p.id, legacy, manager));
    expect(p.fields?.length).toBe(3);
    expect((await get(deal.id)).customFields).toEqual(deal.customFields);
    const before = await get(deal.id);
    const edited = await as(member, () => deals.update(deal.id, updateLeadRequestSchema.parse({ version: before.version, customFields: { [text]: null } }), member));
    expect(edited.version).toBe(before.version + 1);
    expect(edited.customFields).toEqual({ [bool]: false, [num]: "0", [text]: null });
    expect((await readPipeline(p.id)).fields?.map((field) => field.valueCount)).toEqual([1, 1, 0]);
  });

  it("renomeia mantendo IDs/valores, mas recusa tipo e opção usados", async () => {
    let p = await pipeline([definition("select"), definition("text")]);
    const select = field(p, "select"); const text = field(p, "text"); const option = select.options[0]!;
    const deal = await create(p, { [select.id]: option.id, [text.id]: "dado" });
    await expect(save(p, { fields: [{ ...select, options: [select.options[1]] }, text].map(({ id, name, type, options, showOnCard, showInList }) => ({ id, name, type, options, showOnCard, showInList })) })).rejects.toBeInstanceOf(RequisicaoInvalida);
    await expect(save(p, { fields: pipelineParaEdicao(p).fields?.map((field) => field.id === text.id ? { ...field, type: "number" } : field) })).rejects.toBeInstanceOf(RequisicaoInvalida);
    p = await save(p, { fields: pipelineParaEdicao(p).fields?.map((field) => field.id === select.id ? { ...field, name: "Rótulo novo", options: select.options.map((item) => ({ ...item, name: `${item.name} nova` })) } : field) });
    expect(field(p, "select").id).toBe(select.id);
    expect((await get(deal.id)).customFields?.[select.id]).toBe(option.id);
    const history = await as(member, () => deals.history(deal.id, { limit: 100 }, member));
    expect(history.entries).toContainEqual(expect.objectContaining({ field: "custom:select", after: { id: option.id, name: option.name } }));
  });

  it("rejeita campos/opções de outro pipeline e pessoas inelegíveis atomicamente", async () => {
    const p = await pipeline([definition("select"), definition("person")]);
    const other = await pipeline([definition("text"), definition("select")]);
    const select = field(p, "select"); const person = field(p, "person");
    const deal = await create(p); const current = await get(deal.id);
    for (const values of [{ [field(other, "text").id]: "vazamento" }, { [select.id]: field(other, "select").options[0]!.id }, { [person.id]: outsider.id }, { [person.id]: "não-uuid" }]) {
      await expect(as(member, () => deals.update(deal.id, updateLeadRequestSchema.parse({ version: current.version, title: "Não pode persistir", customFields: values }), member))).rejects.toBeInstanceOf(RequisicaoInvalida);
      expect((await get(deal.id)).version).toBe(current.version);
      expect((await get(deal.id)).title).toBe(deal.title);
    }
    const edited = await as(member, () => deals.update(deal.id, updateLeadRequestSchema.parse({ version: current.version, customFields: { [person.id]: manager.id } }), member));
    expect(edited.customFields?.[person.id]).toBe(manager.id);
    const history = await as(member, () => deals.history(deal.id, { limit: 100 }, member));
    expect(history.entries).toContainEqual(expect.objectContaining({ field: "custom:person", after: { id: manager.id, name: expect.any(String) } }));
  });

  it("transferência preserva origem sem expor/escrever, conta preservados e restaura no retorno", async () => {
    const origin = await pipeline([definition("boolean")]); const dest = await pipeline([definition("text")]);
    const sourceField = field(origin, "boolean"); const destField = field(dest, "text");
    const deal = await create(origin, { [sourceField.id]: false });
    await as(member, () => deals.transfer(deal.id, { pipelineId: dest.id, stageId: dest.stages[0]!.id, convertToClient: false }, member));
    let current = await get(deal.id);
    expect(current.customFields).toEqual({});
    expect((await as(member, () => deals.list({ pipelineId: dest.id, status: "all" }, member))).deals.find((item) => item.id === deal.id)?.customFields).toEqual({});
    expect(field(await readPipeline(origin.id), "boolean").valueCount).toBe(1);
    await expect(as(member, () => deals.update(deal.id, { version: current.version, customFields: { [sourceField.id]: null } }, member))).rejects.toBeInstanceOf(RequisicaoInvalida);
    current = await as(member, () => deals.update(deal.id, { version: current.version, customFields: { [destField.id]: "destino" } }, member));
    await as(member, () => deals.transfer(deal.id, { pipelineId: origin.id, stageId: origin.stages[0]!.id, convertToClient: false }, member));
    expect((await get(deal.id)).customFields).toEqual({ [sourceField.id]: false });
    expect((await db.deal.findUniqueOrThrow({ where: { id: deal.id } })).customFields).toEqual({ [sourceField.id]: false, [destField.id]: "destino" });
  });

  it("confirmação remove preenchidos e preservados, gera histórico e invalida versão antiga", async () => {
    let origin = await pipeline([definition("text")]); const dest = await pipeline(); const source = field(origin, "text");
    const first = await create(origin, { [source.id]: "origem" }); const moved = await create(origin, { [source.id]: "transferido" });
    await as(member, () => deals.transfer(moved.id, { pipelineId: dest.id, stageId: dest.stages[0]!.id, convertToClient: false }, member));
    origin = await readPipeline(origin.id);
    expect(field(origin, "text").valueCount).toBe(2);
    await expect(save(origin, { fields: [] })).rejects.toThrow(/2 negócio/);
    const before = await get(moved.id);
    await save(origin, { fields: [], confirmedFieldRemovals: [source.id] });
    expect((await get(first.id)).customFields).toEqual({});
    expect((await db.deal.findUniqueOrThrow({ where: { id: moved.id } })).customFields).toEqual({});
    expect((await get(moved.id)).version).toBe(before.version + 1);
    await expect(as(member, () => deals.update(moved.id, { version: before.version, title: "Obsoleto" }, member))).rejects.toBeInstanceOf(EstadoInvalido);
    const history = await as(member, () => deals.history(moved.id, { limit: 100 }, member));
    expect(history.entries).toContainEqual(expect.objectContaining({ field: "custom:text", before: "transferido", after: null }));
  });

  it("acesso atual e updatedAt/version protegem definições e valores; event_log só tem metadados", async () => {
    let p = await pipeline([definition("text", "Nome privado no rótulo")]); const text = field(p, "text");
    const deal = await create(p, { [text.id]: "Nome privado no valor" }); const before = await get(deal.id);
    await expect(as(member, () => pipelines.update(p.id, pipelineParaEdicao(p), member))).rejects.toBeInstanceOf(AcessoNegado);
    await expect(as(outsider, () => deals.get(deal.id, outsider))).rejects.toBeInstanceOf(NaoEncontrado);
    await expect(as(outsider, () => deals.update(deal.id, { version: before.version, customFields: { [text.id]: "Inválido" } }, outsider))).rejects.toBeInstanceOf(NaoEncontrado);
    const old = p;
    p = await save(p, { name: `${prefix}-${randomUUID()}` });
    await expect(save(old, { fields: [] })).rejects.toBeInstanceOf(EstadoInvalido);
    const edited = await as(member, () => deals.update(deal.id, { version: before.version, customFields: { [text.id]: "Outro nome privado" } }, member));
    expect(edited.version).toBe(before.version + 1);
    await expect(as(member, () => deals.update(deal.id, { version: before.version, customFields: { [text.id]: "Obsoleto" } }, member))).rejects.toBeInstanceOf(EstadoInvalido);
    const events = await db.eventLog.findMany({ where: { entityId: { in: [p.id, deal.id] } }, select: { payload: true } });
    const payloads = JSON.stringify(events);
    for (const privateValue of ["Nome privado no rótulo", "Nome privado no valor", "Outro nome privado"]) expect(payloads).not.toContain(privateValue);
    expect(payloads).toContain(text.id);
  });

  it("remoção simultânea de campo e etapa produz os dois históricos com version +1", async () => {
    let p = await pipeline([definition("text")]);
    const original = p.stages[0]!;
    p = await save(p, { stages: [...pipelineParaEdicao(p).stages, { name: "Destino", color: "#0077FF", staleAfterDays: null, asksClientConversion: false }] });
    const destination = p.stages[1]!;
    const text = field(p, "text");
    const deal = await create(p, { [text.id]: "remover" });
    const before = await get(deal.id);
    p = await readPipeline(p.id);
    await save(p, { fields: [], confirmedFieldRemovals: [text.id], stages: pipelineParaEdicao(p).stages.filter((stage) => stage.id === destination.id), stageDestinations: { [original.id]: destination.id } });
    const after = await get(deal.id);
    expect(after).toMatchObject({ version: before.version + 1, stageId: destination.id, customFields: {} });
    const history = await as(member, () => deals.history(deal.id, { limit: 100 }, member));
    expect(history.entries).toContainEqual(expect.objectContaining({ kind: "stage_changed", fromStageName: original.name, toStageName: destination.name }));
    expect(history.entries).toContainEqual(expect.objectContaining({ kind: "field_changed", field: "custom:text", before: "remover", after: null }));
  });
});
