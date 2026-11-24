import { randomBytes, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDealRequestSchema, createLeadSolarProjectRequestSchema, createPipelineRequestSchema, pipelineParaEdicao,
  updatePipelineRequestSchema, SOLAR_PROCESS_TASKS,
  type Pipeline, type PipelineFieldInput, type PipelineProcessProfile, type SolarProcessActivation,
} from "@plugga/shared";

import { calcularPrazoManaus } from "../src/atividades/calendario-manaus";
import { PrismaAtividadesRepository } from "../src/atividades/prisma-atividades.repository";
import { AuditAppender } from "../src/audit/audit-appender";
import { ClientesService } from "../src/clientes/clientes.service";
import { PrismaClientesRepository } from "../src/clientes/prisma-clientes.repository";
import { EstadoInvalido, RequisicaoInvalida } from "../src/common/errors/dominio";
import type { AuthPrincipal } from "../src/core/auth/auth.types";
import { PrismaLeadProjetosSolaresRepository } from "../src/lead-projetos-solares/prisma-lead-projetos-solares.repository";
import { PrismaNegociosRepository } from "../src/negocios/prisma-negocios.repository";
import { PrismaPipelinesRepository } from "../src/pipelines/prisma-pipelines.repository";
import { contextoBanco } from "../src/prisma/contexto-banco";
import { PrismaService } from "../src/prisma/prisma.service";
import { PrismaProcessoSolarRepository } from "../src/processo-solar/prisma-processo-solar.repository";
import { assertSafeTestDatabaseUrl } from "./safe-test-environment";

/** Mesmo login restrito da aplicação: RLS real em negócios, tarefas e histórico. */
class RuntimePrisma extends PrismaService {
  override comContexto<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return super.comContexto(async (tx) => { await tx.$executeRawUnsafe("SET LOCAL ROLE plugga_runtime"); return fn(tx); });
  }
}

const enabled = process.env.RUN_NEGOCIOS_INTEGRATION_TESTS === "true";
describe.skipIf(!enabled)("processo Solar: ativação, tarefas do POP e avanços de Atendimento/Qualificação", { timeout: 60_000 }, () => {
  const db = new PrismaService();
  const runtime = new RuntimePrisma();
  const audit = new AuditAppender();
  const pipelines = new PrismaPipelinesRepository(runtime, audit);
  const deals = new PrismaNegociosRepository(runtime, audit, new ClientesService(new PrismaClientesRepository(runtime, audit)));
  const projetos = new PrismaLeadProjetosSolaresRepository(runtime, audit);
  const atividades = new PrismaAtividadesRepository(runtime, audit);
  const processo = new PrismaProcessoSolarRepository(runtime, audit);
  const prefix = `processo-solar-${randomUUID().slice(0, 8)}`;
  const users: { principal: AuthPrincipal; sessionHash: string }[] = [];
  let manager: AuthPrincipal; let member: AuthPrincipal; let other: AuthPrincipal;
  const as = <T>(actor: AuthPrincipal, fn: () => Promise<T>): Promise<T> =>
    contextoBanco.run({ sessionHash: users.find((user) => user.principal.id === actor.id)!.sessionHash }, fn);

  async function person(level: "gerente" | "membro") {
    const user = await db.user.create({ data: {
      name: `${prefix} Pessoa ${users.length}`, email: `${prefix}-${users.length}@teste.local`,
      departamentos: { create: { departamento: "crm", nivel: level, telas: ["crm.pipelines"] } },
    } });
    const principal: AuthPrincipal = { id: user.id, kind: "user", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: level, telas: ["crm.pipelines"] }] } };
    const sessionHash = randomBytes(32).toString("hex");
    await db.session.create({ data: { userId: user.id, tokenHash: sessionHash, expiresAt: new Date(Date.now() + 3_600_000), absoluteExpiresAt: new Date(Date.now() + 7_200_000) } });
    users.push({ principal, sessionHash });
    return principal;
  }

  const ETAPAS = ["Iniciar atendimento", "Qualificação", "Cotações/Proposta", "Visita técnica", "Contrato e documentos"];
  async function pipelineSolar(): Promise<Pipeline> {
    const fields: PipelineFieldInput[] = ["installationType", "averageConsumptionKwh", "roofType", "availableAreaM2", "estimatedPowerKwp"].map((name) => ({
      name, type: name === "installationType" || name === "roofType" ? "select" : "number",
      options: name === "installationType" ? ["residential", "commercial", "rural"].map((option) => ({ name: option })) : name === "roofType" ? [{ name: "Livre" }] : [],
      showOnCard: false, showInList: false,
    }));
    const p = await as(manager, () => pipelines.create(createPipelineRequestSchema.parse({
      companyId: "plugga", name: `${prefix}-${randomUUID()}`, description: null, valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
      stages: ETAPAS.map((name) => ({ name, color: "#0077FF", staleAfterDays: null, asksClientConversion: false })), tags: [], lossReasons: [], fields,
    }), manager));
    const [installation, consumption, roof, area, power] = p.fields!;
    const processProfile: PipelineProcessProfile = { key: "solar_commercial", version: 1, bindings: {
      installationType: { fieldId: installation!.id, options: { residential: installation!.options[0]!.id, commercial: installation!.options[1]!.id, rural: installation!.options[2]!.id } },
      averageConsumptionKwh: { fieldId: consumption!.id }, roofType: { fieldId: roof!.id }, availableAreaM2: { fieldId: area!.id }, estimatedPowerKwp: { fieldId: power!.id },
    } };
    return as(manager, () => pipelines.update(p.id, updatePipelineRequestSchema.parse({ ...pipelineParaEdicao(p), processProfile }), manager));
  }
  const ativar = (p: Pipeline) => as(manager, () => processo.ativar(p.id, { stages: {
    atendimento: p.stages[0]!.id, qualificacao: p.stages[1]!.id, proposta: p.stages[2]!.id, visita: p.stages[3]!.id, documentos: p.stages[4]!.id, validacaoKit: null,
  } }, manager));
  /** `semContato` simula lead legado (importado) sem telefone/e-mail: a API atual não cria assim. */
  const criar = async (p: Pipeline, stageId: string, semContato = false) => {
    const deal = await as(member, () => deals.create(createDealRequestSchema.parse({
      pipelineId: p.id, stageId, title: `${prefix} Negócio`, ownerId: member.id, lead: { personType: "pf", name: `${prefix} Lead`, phone: "92999990000" },
    }), member));
    if (semContato) await db.leadProfile.update({ where: { dealId: deal.id }, data: { phone: null, email: null } });
    return deal;
  };
  const mover = (dealId: string, stageId: string, actor = member) => as(actor, async () => {
    const atual = await deals.get(dealId, actor);
    return deals.moveStage(dealId, { stageId, version: atual.version, origin: "quadro" }, actor);
  });
  const tarefas = (dealId: string) => db.activity.findMany({ where: { dealId, origin: "process" }, include: { rounds: { orderBy: { number: "asc" } } }, orderBy: { ruleKey: "asc" } });
  const tarefa = async (dealId: string, role: keyof typeof SOLAR_PROCESS_TASKS) => (await tarefas(dealId)).find((item) => item.ruleKey === SOLAR_PROCESS_TASKS[role].ruleKey);
  async function concluir(dealId: string, role: keyof typeof SOLAR_PROCESS_TASKS, actor = member) {
    const item = (await tarefa(dealId, role))!;
    const atual = await as(actor, () => atividades.get(item.id, actor));
    return as(actor, () => atividades.complete(item.id, { version: atual.version, roundId: atual.currentRound.id, outcome: { summary: "Contato realizado, conta solicitada.", documentIds: [] } }, actor));
  }
  async function conta(dealId: string) {
    return db.leadDocument.create({ data: {
      dealId, category: "conta_de_energia", originalName: "CONTA-SINTETICA.pdf", safeName: "conta.pdf", detectedMime: "application/pdf", sizeBytes: 10,
      storageBucket: "solar-teste", storageKey: `${prefix}/${randomUUID()}`, sha256: randomBytes(32).toString("hex"), uploadState: "ready", uploadedById: member.id,
    } });
  }
  const projeto = (bills: string[]) => createLeadSolarProjectRequestSchema.parse({ installationType: "residential", averageConsumptionKwh: "450", consumerUnit: "UC-SINTETICA-1", energyBillDocumentIds: bills });
  const salvarProjeto = async (dealId: string, bills: string[], actor = member) => as(actor, async () => {
    const atual = await deals.get(dealId, actor);
    return projetos.create(dealId, { ...projeto(bills), version: atual.version }, actor);
  });
  const manausHora = (date: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Manaus", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);

  beforeAll(async () => {
    assertSafeTestDatabaseUrl(process.env.DATABASE_URL!, process.env.CI === "true", process.env.PLUGGA_TEST_DB_PORT);
    await db.$connect();
    await db.company.upsert({ where: { id: "plugga" }, create: { id: "plugga", name: "Plugga" }, update: {} });
    manager = await person("gerente"); member = await person("membro"); other = await person("membro");
  });
  afterAll(async () => {
    const ids = (await db.deal.findMany({ where: { title: { startsWith: prefix } }, select: { id: true } })).map((deal) => deal.id);
    const activityIds = (await db.activity.findMany({ where: { dealId: { in: ids } }, select: { id: true } })).map((item) => item.id);
    await db.activityChange.deleteMany({ where: { activityId: { in: activityIds } } });
    await db.activityRound.deleteMany({ where: { activityId: { in: activityIds } } });
    await db.activity.deleteMany({ where: { id: { in: activityIds } } });
    await db.leadDocument.deleteMany({ where: { dealId: { in: ids } } });
    await db.deal.deleteMany({ where: { id: { in: ids } } });
    await db.pipeline.deleteMany({ where: { name: { startsWith: prefix } } });
    await db.session.deleteMany({ where: { userId: { in: users.map((user) => user.principal.id) } } });
    await db.user.deleteMany({ where: { email: { startsWith: prefix } } });
    await db.$disconnect(); await runtime.$disconnect();
  });

  it("ativação acrescenta Validação do Kit, é idempotente e trava a configuração das etapas", async () => {
    const p = await pipelineSolar();
    const activation: SolarProcessActivation = await ativar(p);
    const stages = await db.pipelineStage.findMany({ where: { pipelineId: p.id }, orderBy: { position: "asc" } });
    expect(stages.map((stage) => stage.name)).toEqual([...ETAPAS, "Validação do Kit"]);
    expect(activation.stages.validacaoKit).toBe(stages[5]!.id);
    expect(await as(manager, () => processo.ativar(p.id, { stages: { ...activation.stages, validacaoKit: activation.stages.validacaoKit } }, manager))).toEqual(activation);
    expect(await db.pipelineStage.count({ where: { pipelineId: p.id } })).toBe(6);
    await expect(as(member, () => processo.ativar(p.id, { stages: { ...activation.stages } }, member))).rejects.toThrow();
    const atual = (await as(manager, () => pipelines.list(manager, { pipelineId: p.id }))).pipelines.find((item) => item.id === p.id)!;
    expect(atual.processProfile?.activation).toEqual(activation);
    // A tela devolve o perfil sem a ativação: a ativação é preservada.
    const semAtivacao = { ...atual.processProfile!, activation: undefined };
    const salvo = await as(manager, () => pipelines.update(p.id, updatePipelineRequestSchema.parse({ ...pipelineParaEdicao(atual), processProfile: semAtivacao, name: `${prefix}-renomeado` }), manager));
    expect(salvo.processProfile?.activation).toEqual(activation);
    const edicao = pipelineParaEdicao(salvo);
    await expect(as(manager, () => pipelines.update(p.id, updatePipelineRequestSchema.parse({ ...edicao, stages: edicao.stages.slice(0, 5), stageDestinations: {} }), manager))).rejects.toThrow(RequisicaoInvalida);
    await expect(as(manager, () => pipelines.update(p.id, updatePipelineRequestSchema.parse({ ...edicao, stages: [...edicao.stages].reverse() }), manager))).rejects.toThrow(/ordem/);
  });

  it("ativação recusa etapa sem papel e ordem trocada", async () => {
    const p = await pipelineSolar();
    await expect(as(manager, () => processo.ativar(p.id, { stages: {
      atendimento: p.stages[0]!.id, qualificacao: p.stages[1]!.id, proposta: p.stages[2]!.id, visita: p.stages[3]!.id, documentos: p.stages[3]!.id, validacaoKit: null,
    } }, manager))).rejects.toThrow();
    await expect(as(manager, () => processo.ativar(p.id, { stages: {
      atendimento: p.stages[1]!.id, qualificacao: p.stages[0]!.id, proposta: p.stages[2]!.id, visita: p.stages[3]!.id, documentos: p.stages[4]!.id, validacaoKit: null,
    } }, manager))).rejects.toThrow(/ordem/);
    expect(await db.pipelineStage.count({ where: { pipelineId: p.id } })).toBe(5);
  });

  it("novo lead no Atendimento cria uma tarefa de 2 dias úteis até 18h de Manaus; sem vínculo a conclusão é recusada", async () => {
    const p = await pipelineSolar(); await ativar(p);
    const lead = await criar(p, p.stages[0]!.id, true);
    const [atendimento] = await tarefas(lead.id);
    expect(atendimento?.ruleKey).toBe(SOLAR_PROCESS_TASKS.atendimento.ruleKey);
    expect(atendimento?.title).toBe("PRIMEIRO CONTATO E QUALIFICAÇÃO");
    expect(atendimento?.createdById).toBe(member.id);
    const round = atendimento!.rounds[0]!;
    expect(round.ownerId).toBe(member.id);
    expect(round.dueAt.toISOString()).toBe(calcularPrazoManaus(round.startsAt, 2).toISOString());
    expect(manausHora(round.dueAt)).toBe("18:00");
    // Sem telefone/e-mail nem Cliente: conclusão recusada e tarefa aberta.
    await expect(concluir(lead.id, "atendimento")).rejects.toThrow(/continua aberta/);
    expect((await tarefa(lead.id, "atendimento"))!.rounds.every((item) => item.endedAt === null)).toBe(true);
    await expect(mover(lead.id, p.stages[1]!.id)).rejects.toThrow(RequisicaoInvalida);
    expect((await db.deal.findUniqueOrThrow({ where: { id: lead.id } })).stageId).toBe(p.stages[0]!.id);
  });

  it("concluir o Atendimento com vínculo avança para Qualificação; salvar a Qualificação avança para Proposta e cria a tarefa uma vez", async () => {
    const p = await pipelineSolar(); await ativar(p);
    const lead = await criar(p, p.stages[0]!.id);
    await concluir(lead.id, "atendimento");
    let deal = await db.deal.findUniqueOrThrow({ where: { id: lead.id } });
    expect(deal.stageId).toBe(p.stages[1]!.id);
    const stageEvents = await db.eventLog.findMany({ where: { entityId: lead.id, eventName: "commercial.deal.stage_changed" } });
    expect(stageEvents).toHaveLength(1);
    expect((stageEvents[0]!.payload as Record<string, unknown>).origin).toBe("processo");
    // Sem conta de energia: a Qualificação não salva nem avança.
    await expect(salvarProjeto(lead.id, [])).rejects.toThrow(/conta de energia/);
    expect((await db.deal.findUniqueOrThrow({ where: { id: lead.id } })).solarProjects).toEqual([]);
    const bill = await conta(lead.id);
    const salvo = await salvarProjeto(lead.id, [bill.id]);
    expect(salvo.advancedToProposal).toBe(true);
    deal = await db.deal.findUniqueOrThrow({ where: { id: lead.id } });
    expect(deal.stageId).toBe(p.stages[2]!.id);
    const proposta = (await tarefa(lead.id, "proposta"))!;
    expect(proposta.rounds).toHaveLength(1);
    expect(proposta.rounds[0]!.dueAt.toISOString()).toBe(calcularPrazoManaus(proposta.rounds[0]!.startsAt, 3).toISOString());
    // Salvar de novo, já em Proposta, não move nem duplica a tarefa.
    const editado = await as(member, async () => projetos.update(lead.id, salvo.project.id, { ...projeto([bill.id]), roofType: "laje", version: (await deals.get(lead.id, member)).version }, member));
    expect(editado.advancedToProposal).toBe(false);
    expect((await tarefas(lead.id)).filter((item) => item.ruleKey === SOLAR_PROCESS_TASKS.proposta.ruleKey)).toHaveLength(1);
    const historico = await db.dealHistory.findMany({ where: { dealId: lead.id, field: { startsWith: "solar:projeto" } } });
    expect(historico.map((row) => row.field)).toEqual(expect.arrayContaining(["solar:projeto", `solar:projeto:${salvo.project.id}:roofType`]));
  });

  it("gravação automática (agente) não avança a Qualificação e versão antiga é recusada", async () => {
    const p = await pipelineSolar(); await ativar(p);
    const lead = await criar(p, p.stages[0]!.id);
    await concluir(lead.id, "atendimento");
    const bill = await conta(lead.id);
    const versao = (await as(member, () => deals.get(lead.id, member))).version;
    await expect(as(member, () => projetos.create(lead.id, { ...projeto([bill.id]), version: versao - 1 }, member))).rejects.toThrow(EstadoInvalido);
    const agente: AuthPrincipal = { ...member, kind: "service" };
    const salvo = await as(member, () => projetos.create(lead.id, { ...projeto([bill.id]), version: versao }, agente));
    expect(salvo.advancedToProposal).toBe(false);
    expect((await db.deal.findUniqueOrThrow({ where: { id: lead.id } })).stageId).toBe(p.stages[1]!.id);
  });

  it("retorno da Visita para Proposta reabre a mesma tarefa com novo prazo e preserva a rodada anterior", async () => {
    const p = await pipelineSolar(); await ativar(p);
    const lead = await criar(p, p.stages[0]!.id);
    await concluir(lead.id, "atendimento");
    await salvarProjeto(lead.id, [(await conta(lead.id)).id]);
    await concluir(lead.id, "proposta");
    await mover(lead.id, p.stages[3]!.id);
    const visita = (await tarefa(lead.id, "visita"))!;
    expect(visita.rounds[0]!.dueAt.toISOString()).toBe(calcularPrazoManaus(visita.rounds[0]!.startsAt, 4).toISOString());
    await mover(lead.id, p.stages[2]!.id);
    const proposta = (await tarefa(lead.id, "proposta"))!;
    expect(proposta.rounds).toHaveLength(2);
    expect(proposta.currentRoundNumber).toBe(2);
    expect(proposta.rounds[0]!.status).toBe("done");
    expect(proposta.rounds[0]!.outcomeSummary).toBe("Contato realizado, conta solicitada.");
    expect(proposta.rounds[1]!.endedAt).toBeNull();
    expect(proposta.rounds[1]!.dueAt.toISOString()).toBe(calcularPrazoManaus(proposta.rounds[1]!.startsAt, 3).toISOString());
    const changes = await db.activityChange.findMany({ where: { activityId: proposta.id }, orderBy: { version: "asc" } });
    expect(changes.map((change) => change.kind)).toEqual(["created", "completed", "reopened"]);
    // Ida e volta de novo com a rodada aberta não abre uma terceira.
    await mover(lead.id, p.stages[3]!.id);
    await mover(lead.id, p.stages[2]!.id);
    expect((await tarefa(lead.id, "proposta"))!.rounds).toHaveLength(2);
  });

  it("dois movimentos concorrentes com a mesma versão geram uma transição e uma tarefa", async () => {
    const p = await pipelineSolar(); await ativar(p);
    const lead = await criar(p, p.stages[0]!.id);
    await concluir(lead.id, "atendimento");
    await salvarProjeto(lead.id, [(await conta(lead.id)).id]);
    await concluir(lead.id, "proposta");
    const atual = await as(member, () => deals.get(lead.id, member));
    const resultados = await Promise.allSettled([1, 2].map(() => as(member, () => deals.moveStage(lead.id, { stageId: p.stages[3]!.id, version: atual.version, origin: "quadro" }, member))));
    expect(resultados.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect((await tarefas(lead.id)).filter((item) => item.ruleKey === SOLAR_PROCESS_TASKS.visita.ruleKey)).toHaveLength(1);
    expect(await db.dealHistory.count({ where: { dealId: lead.id, kind: "stage_changed", toStageId: p.stages[3]!.id } })).toBe(1);
  });

  it("trocar o responsável do card leva as tarefas abertas do processo; lote cobra as mesmas pendências", async () => {
    const p = await pipelineSolar(); await ativar(p);
    const lead = await criar(p, p.stages[0]!.id);
    await as(manager, async () => deals.update(lead.id, { version: (await deals.get(lead.id, manager)).version, ownerId: other.id }, manager));
    expect((await tarefa(lead.id, "atendimento"))!.rounds[0]!.ownerId).toBe(other.id);
    const semVinculo = await criar(p, p.stages[0]!.id, true);
    await expect(as(manager, async () => {
      const versoes = Object.fromEntries(await Promise.all([lead.id, semVinculo.id].map(async (id) => [id, (await deals.get(id, manager)).version] as const)));
      return deals.bulk({ dealIds: [lead.id, semVinculo.id], action: { type: "stage", stageId: p.stages[1]!.id }, versions: versoes }, manager);
    })).rejects.toThrow(RequisicaoInvalida);
    expect((await db.deal.findUniqueOrThrow({ where: { id: lead.id } })).stageId).toBe(p.stages[0]!.id);
  });

  it("negócio aberto antes da ativação é cobrado só no próximo avanço; outros pipelines não ganham tarefas", async () => {
    const p = await pipelineSolar();
    const legado = await criar(p, p.stages[1]!.id, true);
    expect(await tarefas(legado.id)).toHaveLength(0);
    await ativar(p);
    expect(await tarefas(legado.id)).toHaveLength(0);
    await expect(mover(legado.id, p.stages[2]!.id)).rejects.toThrow(/Qualificação/);
    await mover(legado.id, p.stages[0]!.id); // retorno não tem bloqueio
    expect((await tarefas(legado.id)).map((item) => item.ruleKey)).toEqual([SOLAR_PROCESS_TASKS.atendimento.ruleKey]);
    const comum = await pipelineSolar(); // perfil associado, mas sem ativação
    const negocio = await criar(comum, comum.stages[0]!.id, true);
    await mover(negocio.id, comum.stages[3]!.id);
    expect(await tarefas(negocio.id)).toHaveLength(0);
    const situacao = await as(member, () => processo.situacao(negocio.id, member));
    expect(situacao).toMatchObject({ active: false, role: null, pendencies: [] });
  });
});
