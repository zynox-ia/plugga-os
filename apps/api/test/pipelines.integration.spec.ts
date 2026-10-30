import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPipelineRequestSchema, pipelineParaEdicao, updatePipelineRequestSchema, type CompanyKey, type Pipeline } from "@plugga/shared";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { AcessoNegado, Conflito, EstadoInvalido, NaoEncontrado } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { PrismaPipelinesRepository } from "../src/pipelines/prisma-pipelines.repository.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

/**
 * Pipelines de venda configuráveis (PLU-269) contra o Postgres de verdade:
 * quem vê e quem configura, a troca das listas por inteiro, a trava otimista,
 * o nome único por empresa e o arquivamento.
 *
 *     pnpm --filter @plugga/api test:pipelines
 */
const HABILITADO = process.env.RUN_PIPELINES_INTEGRATION_TESTS === "true";
const PRAZO_MS = 60_000;

describe.skipIf(!HABILITADO)("pipelines: configuração no Postgres", () => {
  const prisma = new PrismaService();
  const repositorio = new PrismaPipelinesRepository(prisma, new AuditAppender());
  const marca = `pip-${randomUUID().slice(0, 8)}`;
  const pessoas: Record<"gestorWaze" | "vendedora" | "forasteiro" | "vendedorPlugga" | "semCrm", AuthPrincipal> = {} as never;

  const configuracao = (dados: { companyId?: CompanyKey; name?: string; members?: { userId: string; role: "vendedor" | "gestor" }[] } = {}) => ({
    companyId: dados.companyId ?? "waze",
    name: dados.name ?? `${marca} Solar`,
    description: "Venda de usinas fotovoltaicas.",
    valueLabel: "Investimento estimado",
    color: "#0B7A57",
    wonLabel: "Contrato assinado",
    lostLabel: "Perdido",
    stages: ["Iniciar atendimento", "Qualificação", "Cotações/Proposta", "Visita técnica", "Contrato e documentos"].map((name, i) => ({
      name,
      color: "#00A3FF",
      staleAfterDays: i + 3,
    })),
    tags: [{ name: "Grupo A", color: "#0077FF" }],
    lossReasons: [
      { name: "Fechou com concorrente", asksRevisitDate: false },
      { name: "Prazo inadequado", asksRevisitDate: true },
    ],
    members: dados.members ?? [],
  });

  // Mesma validação e normalização que o controller aplica antes do repositório.
  const criar = (dados: unknown, principal: AuthPrincipal) => repositorio.create(createPipelineRequestSchema.parse(dados), principal);
  const salvar = (pipeline: Pipeline, mudanca: Record<string, unknown>, principal: AuthPrincipal) =>
    repositorio.update(pipeline.id, updatePipelineRequestSchema.parse({ ...pipelineParaEdicao(pipeline), ...mudanca }), principal);
  const nomesVistos = async (principal: AuthPrincipal) =>
    (await repositorio.list(principal)).pipelines.map((p) => p.name).filter((nome) => nome.startsWith(marca));

  /** `crm` é o departamento do CRM; sem ele a pessoa existe mas não é elegível à equipe de pipeline. */
  async function pessoa(chave: keyof typeof pessoas, nivel: "membro" | "gerente" | null = "membro"): Promise<void> {
    const usuario = await prisma.user.create({
      data: {
        email: `${marca}-${chave.toLowerCase()}@teste.local`,
        name: `${marca} ${chave}`,
        departamentos: {
          create: nivel === null ? { departamento: "financeiro", nivel: "membro" } : { departamento: "crm", nivel, telas: ["crm.pipelines"] },
        },
      },
    });
    pessoas[chave] = {
      id: usuario.id,
      kind: "user",
      acesso: { plataforma: null, departamentos: [{ departamento: nivel === null ? "financeiro" : "crm", nivel: nivel ?? "membro" }] },
    };
  }

  beforeAll(async () => {
    await prisma.$connect();
    await pessoa("gestorWaze", "gerente");
    await pessoa("vendedora");
    await pessoa("forasteiro");
    await pessoa("vendedorPlugga");
    await pessoa("semCrm", null);
  }, PRAZO_MS);

  afterAll(async () => {
    // O event_log é só de inserção: o rastro fica, apontando para ids únicos.
    await prisma.pipeline.deleteMany({ where: { name: { startsWith: marca } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it(
    "o gestor comercial da Waze cria o Solar com cinco etapas, e todos com acesso ao CRM o veem",
    async () => {
      const solar = await criar(configuracao(), pessoas.gestorWaze);

      expect(solar.stages.map((e) => e.position)).toEqual([0, 1, 2, 3, 4]);
      expect(solar.lossReasons.find((m) => m.name === "Prazo inadequado")?.asksRevisitDate).toBe(true);
      expect(solar.updatedBy?.id).toBe(pessoas.gestorWaze.id);
      expect(await nomesVistos(pessoas.vendedora)).toContain(solar.name);
      expect(await nomesVistos(pessoas.gestorWaze)).toContain(solar.name);
      expect(await nomesVistos(pessoas.forasteiro)).toContain(solar.name);
      expect(await nomesVistos(pessoas.vendedorPlugga)).toContain(solar.name);

      const vistoPelaVendedora = (await repositorio.list(pessoas.vendedora)).pipelines.find((p) => p.id === solar.id);
      expect(vistoPelaVendedora?.canConfigure).toBe(false);

      const eventos = await prisma.eventLog.findMany({ where: { eventName: "commercial.pipeline.created", entityId: solar.id } });
      expect(eventos).toHaveLength(1);
      expect(eventos[0]?.actorId).toBe(pessoas.gestorWaze.id);
    },
    PRAZO_MS,
  );

  it(
    "vendedor não cria nem altera pipeline, e quem está fora não sabe que ele existe",
    async () => {
      await expect(criar(configuracao({ name: `${marca} Vendedor` }), pessoas.vendedora)).rejects.toBeInstanceOf(AcessoNegado);
      const solar = await criar(configuracao({ name: `${marca} Bloqueado` }), pessoas.gestorWaze);
      const doVendedor = (await repositorio.list(pessoas.vendedora)).pipelines.find((p) => p.id === solar.id)!;
      await expect(salvar(doVendedor, { name: `${marca} Renomeado` }, pessoas.vendedora)).rejects.toBeInstanceOf(AcessoNegado);
      await expect(salvar(solar, { name: `${marca} Renomeado` }, pessoas.semCrm)).rejects.toBeInstanceOf(NaoEncontrado);
      await expect(repositorio.archive(solar.id, pessoas.vendedora)).rejects.toBeInstanceOf(AcessoNegado);
    },
    PRAZO_MS,
  );

  it(
    "recusa equipe por funil e lista responsáveis do CRM",
    async () => {
      const foraDoCrm = configuracao({ name: `${marca} Equipe`, members: [{ userId: pessoas.semCrm.id, role: "vendedor" }] });
      expect(createPipelineRequestSchema.safeParse(foraDoCrm).success).toBe(false);

      const { people } = await repositorio.people({ companyId: "waze" }, pessoas.gestorWaze);
      const ids = people.map((p) => p.id);
      expect(ids).toEqual(expect.arrayContaining([pessoas.vendedora.id, pessoas.forasteiro.id, pessoas.gestorWaze.id]));
      expect(ids).not.toContain(pessoas.semCrm.id);
      expect((await repositorio.people({ companyId: "waze" }, pessoas.vendedora)).people.map((p) => p.id)).toEqual(ids);
    },
    PRAZO_MS,
  );

  it(
    "edita etapas por inteiro mantendo os ids, registra quem alterou e recusa versão desatualizada",
    async () => {
      const solar = await criar(configuracao({ name: `${marca} Etapas` }), pessoas.gestorWaze);
      const [primeira, segunda, ...resto] = pipelineParaEdicao(solar).stages;
      const novas = [{ ...segunda!, name: "Qualificação técnica" }, primeira!, ...resto.slice(1), { name: "Assinatura", color: "#18A957", staleAfterDays: null }];

      const editado = await salvar(solar, { stages: novas, wonLabel: "Usina contratada" }, pessoas.gestorWaze);

      expect(editado.stages.map((e) => e.name)).toEqual(["Qualificação técnica", "Iniciar atendimento", "Visita técnica", "Contrato e documentos", "Assinatura"]);
      expect(editado.stages[0]?.id).toBe(segunda!.id);
      expect(editado.stages.some((e) => e.id === resto[0]!.id)).toBe(false);
      expect(editado.wonLabel).toBe("Usina contratada");

      const evento = await prisma.eventLog.findFirst({ where: { eventName: "commercial.pipeline.updated", entityId: solar.id } });
      expect(evento?.payload).toMatchObject({ campos: ["wonLabel"], secoes: ["geral", "etapas"] });

      await expect(salvar(solar, { name: `${marca} Atrasado` }, pessoas.gestorWaze)).rejects.toBeInstanceOf(EstadoInvalido);
    },
    PRAZO_MS,
  );

  it(
    "gestor antigo do funil não configura; gestão do CRM salva sem apagar vínculos antigos",
    async () => {
      const solar = await criar(
        configuracao({ name: `${marca} Gestora` }),
        pessoas.gestorWaze,
      );
      await prisma.pipelineMember.create({ data: { pipelineId: solar.id, userId: pessoas.vendedora.id, role: "gestor" } });
      const daGestora = (await repositorio.list(pessoas.vendedora)).pipelines.find((p) => p.id === solar.id)!;
      expect(daGestora.canConfigure).toBe(false);
      await expect(salvar(daGestora, { description: "Negado" }, pessoas.vendedora)).rejects.toBeInstanceOf(AcessoNegado);

      const renomeado = await salvar(daGestora, { description: "Usinas e baterias." }, pessoas.gestorWaze);
      expect(renomeado.description).toBe("Usinas e baterias.");
      expect(await prisma.pipelineMember.count({ where: { pipelineId: solar.id } })).toBe(1);
      await expect(salvar(renomeado, { companyId: "plugga", members: [] }, pessoas.vendedora)).rejects.toBeInstanceOf(AcessoNegado);

      await expect(criar(configuracao({ name: `${marca} GESTORA` }), pessoas.gestorWaze)).rejects.toBeInstanceOf(Conflito);
    },
    PRAZO_MS,
  );

  it(
    "relê do banco Geral, Etapas e Etiquetas após criar e editar",
    async () => {
      const entrada = configuracao({ name: `${marca} Persistencia` });
      const criado = await criar(entrada, pessoas.gestorWaze);
      const reler = async () => (await repositorio.list(pessoas.gestorWaze)).pipelines.find((p) => p.id === criado.id)!;
      expect(await reler()).toMatchObject({
        ...entrada,
        stages: entrada.stages.map((etapa, position) => ({ ...etapa, position })),
      });

      const mudanca = {
        name: `${marca} Persistencia editada`, description: "Descrição alterada", valueLabel: "Receita", color: "#E5484D",
        stages: [
          { ...pipelineParaEdicao(criado).stages[1]!, name: "Análise", staleAfterDays: 12 },
          { ...pipelineParaEdicao(criado).stages[0]!, color: "#F5A524", staleAfterDays: null },
        ],
        tags: [{ ...criado.tags[0]!, name: "Prioritário", color: "#18A957" }, { name: "Novo", color: "#0077FF" }],
      };
      await salvar(criado, mudanca, pessoas.gestorWaze);
      const lido = await reler();
      expect(lido).toMatchObject(mudanca);
      expect(lido.stages).toHaveLength(2);
      expect(lido.stages.map((e) => e.position)).toEqual([0, 1]);
      expect(lido.tags).toHaveLength(2);
      expect(lido.members).toHaveLength(0);
      expect(await nomesVistos(pessoas.vendedora)).toContain(lido.name);
      expect(await nomesVistos(pessoas.forasteiro)).toContain(lido.name);
    },
    PRAZO_MS,
  );

  it(
    "arquivar mantém o pipeline consultável pela equipe, e reativar o devolve",
    async () => {
      const solar = await criar(configuracao({ name: `${marca} Arquivo` }), pessoas.gestorWaze);

      const arquivado = await repositorio.archive(solar.id, pessoas.gestorWaze);
      expect(arquivado.archivedAt).not.toBeNull();
      const vistoPelaEquipe = (await repositorio.list(pessoas.vendedora)).pipelines.find((p) => p.id === solar.id);
      expect(vistoPelaEquipe?.archivedAt).not.toBeNull();
      await expect(repositorio.archive(solar.id, pessoas.gestorWaze)).rejects.toBeInstanceOf(EstadoInvalido);

      const reativado = await repositorio.restore(solar.id, pessoas.gestorWaze);
      expect(reativado.archivedAt).toBeNull();
      const eventos = await prisma.eventLog.findMany({ where: { entityId: solar.id }, orderBy: { occurredAt: "asc" } });
      expect(eventos.map((e) => e.eventName)).toEqual(["commercial.pipeline.created", "commercial.pipeline.archived", "commercial.pipeline.restored"]);
    },
    PRAZO_MS,
  );
});
