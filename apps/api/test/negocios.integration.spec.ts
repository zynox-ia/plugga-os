import { randomInt, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bulkDealsRequestSchema,
  createDealRequestSchema,
  createPipelineRequestSchema,
  loseDealRequestSchema,
  pipelineParaEdicao,
  updatePipelineRequestSchema,
  type CompanyKey,
  type Pipeline,
} from "@plugga/shared";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { hojeNoFuso } from "../src/negocios/negocios.rules.js";
import { PrismaNegociosRepository } from "../src/negocios/prisma-negocios.repository.js";
import { PrismaPipelinesRepository } from "../src/pipelines/prisma-pipelines.repository.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Negócios no quadro do pipeline (PLU-271) contra o Postgres de verdade:
 * criar, mudar de etapa com histórico, ganhar, perder com motivo, mover para
 * pipeline de outra empresa, ações em lote e as regras de configuração que
 * dependem dos negócios.
 *
 *     pnpm --filter @plugga/api test:negocios
 */
const HABILITADO = process.env.RUN_NEGOCIOS_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;

describe.skipIf(!HABILITADO)("negócios: quadro do pipeline no Postgres", () => {
  const prisma = new PrismaService();
  const auditoria = new AuditAppender();
  const pipelines = new PrismaPipelinesRepository(prisma, auditoria);
  const negocios = new PrismaNegociosRepository(prisma, auditoria);
  const marca = `neg-${randomUUID().slice(0, 8)}`;
  const pessoas = {} as Record<"gestor" | "ana" | "bruno" | "forasteiro" | "pluggaVendedor", AuthPrincipal>;
  let solar: Pipeline;
  let mercadoLivre: Pipeline;
  let clienteId: string;
  let contatoId: string;
  let ucId: string;
  let outroContatoId: string;

  const etapa = (nome: string) => solar.stages.find((e) => e.name === nome)!.id;
  const novo = (dados: Record<string, unknown> = {}) =>
    negocios.create(
      createDealRequestSchema.parse({
        pipelineId: solar.id,
        stageId: etapa("Qualificação"),
        clientId: clienteId,
        ownerId: pessoas.ana.id,
        title: `${marca} Galpão logístico — 150 kWp`,
        value: "620000.00",
        expectedCloseDate: "2026-12-15",
        ...dados,
      }),
      pessoas.ana,
    );

  /** A empresa é só etiqueta do pipeline: quem é do CRM entra em qualquer um, e o gerente do CRM gere os dois. */
  async function pessoa(chave: keyof typeof pessoas, gestor = false): Promise<void> {
    const nivel = gestor ? "gerente" : "membro";
    const usuario = await prisma.user.create({
      data: {
        email: `${marca}-${chave.toLowerCase()}@teste.local`,
        name: `${marca} ${chave}`,
        departamentos: { create: { departamento: "crm", nivel, telas: chave === "forasteiro" ? [] : ["crm.pipelines"] } },
      },
    });
    pessoas[chave] = { id: usuario.id, kind: "user", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel }] } };
  }

  const configuracao = (empresa: CompanyKey, nome: string, etapas: string[]) =>
    createPipelineRequestSchema.parse({
      companyId: empresa,
      name: `${marca} ${nome}`,
      description: null,
      valueLabel: "Investimento estimado",
      color: "#0B7A57",
      wonLabel: "Contrato assinado",
      lostLabel: "Perdido",
      stages: etapas.map((name) => ({ name, color: "#00A3FF", staleAfterDays: 7 })),
      tags: [{ name: "Grupo A", color: "#0077FF" }, { name: "Indicação", color: "#7C5CFF" }],
      lossReasons: [
        { name: "Fechou com concorrente", asksRevisitDate: false },
        { name: "Prazo inadequado", asksRevisitDate: true },
      ],
      members: [],
    });

  beforeAll(async () => {
    await prisma.$connect();
    for (const [id, name] of [["plugga", "Plugga"], ["waze", "Waze Energia"]] as const) {
      await prisma.company.upsert({ where: { id }, create: { id, name }, update: {} });
    }
    await pessoa("gestor", true);
    await pessoa("ana");
    await pessoa("bruno");
    await pessoa("forasteiro");
    await pessoa("pluggaVendedor");

    solar = await pipelines.create(
      configuracao("waze", "Solar", ["Iniciar atendimento", "Qualificação", "Cotações/Proposta", "Visita técnica"]),
      pessoas.gestor,
    );
    mercadoLivre = await pipelines.create(
      configuracao("plugga", "Mercado Livre", ["Diagnóstico", "Proposta"]),
      pessoas.gestor,
    );

    const cliente = await prisma.client.create({
      data: {
        name: `${marca} Logística Igarapé`,
        contacts: { create: { name: "Juliana Prado", isPrimary: true } },
        consumerUnits: { create: { code: `9999${randomInt(100_000, 999_999)}`, distributor: "Amazonas Energia" } },
      },
      include: { contacts: true, consumerUnits: true },
    });
    clienteId = cliente.id;
    contatoId = cliente.contacts[0]!.id;
    ucId = cliente.consumerUnits[0]!.id;
    const outro = await prisma.client.create({ data: { name: `${marca} Outro cliente`, contacts: { create: { name: "Rodrigo Lima" } } }, include: { contacts: true } });
    outroContatoId = outro.contacts[0]!.id;
  }, PRAZO_MS);

  afterAll(async () => {
    // O event_log é só de inserção: o rastro fica, apontando para ids únicos.
    await prisma.deal.deleteMany({ where: { title: { startsWith: marca } } });
    await prisma.pipeline.deleteMany({ where: { name: { startsWith: marca } } });
    await prisma.client.deleteMany({ where: { name: { startsWith: marca } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it(
    "a vendedora cria o negócio; a equipe toda o vê, quem está fora não",
    async () => {
      const negocio = await novo({ contactId: contatoId, tagIds: [solar.tags[0]!.id], consumerUnitIds: [ucId] });

      expect(negocio).toMatchObject({ status: "open", companyId: "waze", value: "620000.00", expectedCloseDate: "2026-12-15" });
      expect(negocio.contact?.id).toBe(contatoId);
      expect(negocio.tags.map((t) => t.name)).toEqual(["Grupo A"]);
      expect(negocio.consumerUnits.map((u) => u.id)).toEqual([ucId]);

      const doBruno = await negocios.list({ pipelineId: solar.id, status: "open" }, pessoas.bruno);
      expect(doBruno.deals.map((d) => d.id)).toContain(negocio.id);
      await expect(negocios.list({ pipelineId: solar.id, status: "open" }, pessoas.forasteiro)).rejects.toBeInstanceOf(NaoEncontrado);

      const historico = await prisma.dealHistory.findMany({ where: { dealId: negocio.id } });
      expect(historico).toMatchObject([{ kind: "created", toStageName: "Qualificação", actorId: pessoas.ana.id }]);
      expect(await prisma.eventLog.count({ where: { eventName: "commercial.deal.created", entityId: negocio.id } })).toBe(1);
    },
    PRAZO_MS,
  );

  it(
    "recusa responsável sem acesso ao CRM e contato de outro cliente",
    async () => {
      await expect(novo({ ownerId: pessoas.forasteiro.id })).rejects.toBeInstanceOf(RequisicaoInvalida);
      await expect(novo({ contactId: outroContatoId })).rejects.toBeInstanceOf(RequisicaoInvalida);
      await expect(novo({ stageId: mercadoLivre.stages[0]!.id })).rejects.toBeInstanceOf(RequisicaoInvalida);
    },
    PRAZO_MS,
  );

  it("responsáveis vêm do acesso ativo: admin, desenvolvedor e CRM sem vínculo no funil", async () => {
    for (const papel of ["admin", "desenvolvedor"] as const) {
      const role = await prisma.role.upsert({ where: { key: papel }, create: { key: papel, name: papel }, update: {} });
      const usuario = await prisma.user.create({ data: {
        email: `${marca}-${papel}@teste.local`, name: `${marca} ${papel}`, status: "active",
        platformRoles: { create: { roleId: role.id } },
      } });
      const principal: AuthPrincipal = { id: usuario.id, kind: "user", acesso: { plataforma: papel, departamentos: [] } };
      const lista = await pipelines.list(principal);
      expect(lista.pipelines.some((p) => p.id === solar.id)).toBe(true);
      expect(lista.responsaveis).toContainEqual({ id: usuario.id, name: usuario.name, email: usuario.email });
      expect((await novo({ ownerId: usuario.id })).owner.id).toBe(usuario.id);
      expect(await prisma.pipelineMember.count({ where: { userId: usuario.id } })).toBe(0);
    }
    // Gestor do CRM também pode ser responsável sem equipe atribuída no pipeline.
    const criado = await novo({ ownerId: pessoas.gestor.id });
    expect(criado.owner.id).toBe(pessoas.gestor.id);
    const lista = await pipelines.list(pessoas.ana);
    expect(lista.canCreateIn).toEqual([]);
    expect(lista.pipelines.find((p) => p.id === mercadoLivre.id)?.canConfigure).toBe(false);
    for (const status of ["invited", "disabled", "removed"]) {
      const usuario = await prisma.user.create({ data: {
        email: `${marca}-${status}@teste.local`, name: `${marca} ${status}`, status,
        departamentos: { create: { departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] } },
      } });
      expect((await pipelines.people({ companyId: "waze" }, pessoas.ana)).people.some((p) => p.id === usuario.id)).toBe(false);
      await expect(novo({ ownerId: usuario.id })).rejects.toBeInstanceOf(RequisicaoInvalida);
      await expect(negocios.bulk(bulkDealsRequestSchema.parse({ dealIds: [criado.id], action: { type: "owner", ownerId: usuario.id } }), pessoas.ana)).rejects.toBeInstanceOf(RequisicaoInvalida);
      await expect(negocios.transfer(criado.id, { pipelineId: mercadoLivre.id, stageId: mercadoLivre.stages[0]!.id, ownerId: usuario.id }, pessoas.ana)).rejects.toBeInstanceOf(RequisicaoInvalida);
    }
    expect((await pipelines.people({ companyId: "waze" }, pessoas.ana)).people.some((p) => p.id === pessoas.forasteiro.id)).toBe(false);
    // Revogar a tela derruba imediatamente a elegibilidade, mesmo mantendo o departamento.
    await prisma.userDepartamento.updateMany({ where: { userId: pessoas.gestor.id }, data: { telas: [] } });
    try {
      await expect(novo({ ownerId: pessoas.gestor.id })).rejects.toBeInstanceOf(RequisicaoInvalida);
    } finally {
      await prisma.userDepartamento.updateMany({ where: { userId: pessoas.gestor.id }, data: { telas: ["crm.pipelines"] } });
    }
  }, PRAZO_MS);

  it(
    "arrastar de Qualificação para Cotações/Proposta grava a etapa e o histórico",
    async () => {
      const negocio = await novo();
      const movido = await negocios.moveStage(negocio.id, { stageId: etapa("Cotações/Proposta") }, pessoas.bruno);

      const relido = (await negocios.list({ pipelineId: solar.id, status: "open" }, pessoas.ana)).deals.find((d) => d.id === negocio.id)!;
      expect(relido.stageId).toBe(etapa("Cotações/Proposta"));
      expect(new Date(movido.stageEnteredAt).getTime()).toBeGreaterThanOrEqual(new Date(negocio.stageEnteredAt).getTime());
      const mudanca = await prisma.dealHistory.findFirst({ where: { dealId: negocio.id, kind: "stage_changed" } });
      expect(mudanca).toMatchObject({ fromStageName: "Qualificação", toStageName: "Cotações/Proposta", actorId: pessoas.bruno.id });
    },
    PRAZO_MS,
  );

  it(
    "perder exige motivo e, se o motivo pede, a data de revisita; encerrado não muda de etapa",
    async () => {
      const negocio = await novo();
      const prazo = solar.lossReasons.find((m) => m.name === "Prazo inadequado")!;
      expect(loseDealRequestSchema.safeParse({}).success).toBe(false);
      await expect(negocios.lose(negocio.id, loseDealRequestSchema.parse({ lossReasonId: prazo.id }), pessoas.ana)).rejects.toBeInstanceOf(RequisicaoInvalida);

      const perdido = await negocios.lose(negocio.id, loseDealRequestSchema.parse({ lossReasonId: prazo.id, revisitOn: "2099-01-10" }), pessoas.ana);
      expect(perdido).toMatchObject({ status: "lost", lossReason: "Prazo inadequado", revisitOn: "2099-01-10" });
      await expect(negocios.moveStage(negocio.id, { stageId: etapa("Visita técnica") }, pessoas.ana)).rejects.toBeInstanceOf(EstadoInvalido);

      const abertos = await negocios.list({ pipelineId: solar.id, status: "open" }, pessoas.ana);
      const perdidos = await negocios.list({ pipelineId: solar.id, status: "lost" }, pessoas.ana);
      expect(abertos.deals.some((d) => d.id === negocio.id)).toBe(false);
      expect(perdidos.deals.some((d) => d.id === negocio.id)).toBe(true);
      expect(hojeNoFuso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    },
    PRAZO_MS,
  );

  it(
    "ganhar encerra o negócio na etapa em que estava",
    async () => {
      const negocio = await novo();
      const ganho = await negocios.win(negocio.id, pessoas.ana);
      expect(ganho).toMatchObject({ status: "won", stageId: etapa("Qualificação") });
      expect(ganho.closedAt).not.toBeNull();
    },
    PRAZO_MS,
  );

  it(
    "mover para o pipeline da Plugga muda a empresa e mantém responsável elegível e histórico",
    async () => {
      const negocio = await novo({ tagIds: [solar.tags[0]!.id] });
      const destino = { pipelineId: mercadoLivre.id, stageId: mercadoLivre.stages[1]!.id };
      await expect(negocios.transfer(negocio.id, destino, pessoas.forasteiro)).rejects.toBeInstanceOf(NaoEncontrado);

      const movido = await negocios.transfer(negocio.id, destino, pessoas.pluggaVendedor);
      expect(movido).toMatchObject({ companyId: "plugga", pipelineId: mercadoLivre.id, stageId: mercadoLivre.stages[1]!.id, tags: [] });
      expect(movido.owner.id).toBe(pessoas.ana.id);
      const historico = await prisma.dealHistory.findMany({ where: { dealId: negocio.id }, orderBy: { occurredAt: "asc" } });
      expect(historico.map((h) => h.kind)).toEqual(["created", "transferred"]);
      expect(historico[1]).toMatchObject({ fromStageName: "Qualificação", toStageName: "Proposta" });
    },
    PRAZO_MS,
  );

  it(
    "ações em lote trocam o responsável, põem etiqueta e movem só os abertos",
    async () => {
      const a = await novo();
      const b = await novo();
      const ganho = await negocios.win((await novo()).id, pessoas.ana);
      const ids = [a.id, b.id, ganho.id];

      const lote = (acao: unknown) => negocios.bulk(bulkDealsRequestSchema.parse({ dealIds: ids, action: acao }), pessoas.ana);
      expect((await lote({ type: "owner", ownerId: pessoas.bruno.id })).deals.every((d) => d.owner.id === pessoas.bruno.id)).toBe(true);
      expect((await lote({ type: "tag", tagId: solar.tags[1]!.id })).deals.every((d) => d.tags.some((t) => t.name === "Indicação"))).toBe(true);
      const movidos = (await lote({ type: "stage", stageId: etapa("Visita técnica") })).deals;
      expect(movidos.find((d) => d.id === a.id)?.stageId).toBe(etapa("Visita técnica"));
      expect(movidos.find((d) => d.id === ganho.id)?.stageId).toBe(etapa("Qualificação"));

      await expect(
        negocios.bulk(bulkDealsRequestSchema.parse({ dealIds: [a.id], action: { type: "owner", ownerId: pessoas.forasteiro.id } }), pessoas.ana),
      ).rejects.toBeInstanceOf(RequisicaoInvalida);
    },
    PRAZO_MS,
  );

  it(
    "na configuração, pipeline com negócios não troca de empresa e etapa com negócios só sai com destino",
    async () => {
      const atual = (await pipelines.list(pessoas.gestor)).pipelines.find((p) => p.id === solar.id)!;
      expect(atual.dealCount).toBeGreaterThan(0);
      const salvar = (mudanca: Record<string, unknown>) =>
        pipelines.update(solar.id, updatePipelineRequestSchema.parse({ ...pipelineParaEdicao(atual), ...mudanca }), pessoas.gestor);

      await expect(salvar({ companyId: "plugga", members: [] })).rejects.toBeInstanceOf(RequisicaoInvalida);

      const qualificacao = etapa("Qualificação");
      const semQualificacao = pipelineParaEdicao(atual).stages.filter((e) => e.id !== qualificacao);
      await expect(salvar({ stages: semQualificacao })).rejects.toBeInstanceOf(RequisicaoInvalida);

      const depois = await salvar({ stages: semQualificacao, stageDestinations: { [qualificacao]: etapa("Iniciar atendimento") } });
      expect(depois.stages.some((e) => e.id === qualificacao)).toBe(false);
      expect(await prisma.deal.count({ where: { stageId: qualificacao } })).toBe(0);
      const movidos = await prisma.deal.findMany({ where: { pipelineId: solar.id, stageId: etapa("Iniciar atendimento") } });
      expect(movidos.length).toBeGreaterThan(0);
    },
    PRAZO_MS,
  );
});
