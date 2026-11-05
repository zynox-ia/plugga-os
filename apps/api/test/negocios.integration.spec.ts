import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  bulkDealsRequestSchema,
  createDealRequestSchema,
  createPipelineRequestSchema,
  loseDealRequestSchema,
  pipelineParaEdicao,
  transferDealRequestSchema,
  updateLeadRequestSchema,
  updatePipelineRequestSchema,
  winDealRequestSchema,
  type CompanyKey,
  type Pipeline,
} from "@plugga/shared";

import { AuditAppender } from "../src/audit/audit-appender.js";
import { ClientesService } from "../src/clientes/clientes.service.js";
import { PrismaClientesRepository } from "../src/clientes/prisma-clientes.repository.js";
import { EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../src/common/errors/dominio.js";
import type { AuthPrincipal } from "../src/core/auth/auth.types.js";
import { hojeNoFuso } from "../src/negocios/negocios.rules.js";
import { PrismaNegociosRepository } from "../src/negocios/prisma-negocios.repository.js";
import { PrismaPipelinesRepository } from "../src/pipelines/prisma-pipelines.repository.js";
import { PrismaService } from "../src/prisma/prisma.service.js";

const ganhar = (convertToClient = false) => winDealRequestSchema.parse({ convertToClient });

/** Documento sintético (faixa 999999…) com dígito verificador válido. */
function digitoVerificador(base: number[], pesos: number[]): number {
  const resto = base.reduce((soma, d, i) => soma + d * pesos[i]!, 0) % 11;
  return resto < 2 ? 0 : 11 - resto;
}
function gerarCpf(): string {
  const base = [9, 9, 9, 9, 9, 9, ...Array.from({ length: 3 }, () => Math.floor(Math.random() * 10))];
  const d1 = digitoVerificador(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador([...base, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, d2].join("");
}

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
  const clientes = new ClientesService(new PrismaClientesRepository(prisma, auditoria));
  const negocios = new PrismaNegociosRepository(prisma, auditoria, clientes);
  const marca = `neg-${randomUUID().slice(0, 8)}`;
  const pessoas = {} as Record<"gestor" | "ana" | "bruno" | "forasteiro" | "pluggaVendedor", AuthPrincipal>;
  let solar: Pipeline;
  let mercadoLivre: Pipeline;
  let clienteId: string;

  const etapa = (nome: string) => solar.stages.find((e) => e.name === nome)!.id;
  const novo = (dados: Record<string, unknown> = {}) =>
    negocios.create(
      createDealRequestSchema.parse({
        pipelineId: solar.id,
        stageId: etapa("Qualificação"),
        ownerId: pessoas.ana.id,
        title: `${marca} Galpão logístico — 150 kWp`,
        value: "620000.00",
        expectedCloseDate: "2026-12-15",
        lead: { personType: "pj", name: `${marca} Lead`, phone: "92999990000" },
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
      stages: etapas.map((name) => ({ name, color: "#00A3FF", staleAfterDays: 7, asksClientConversion: false })),
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
        phone: "(92) 99999-9999", email: "cliente@teste.local", city: "Manaus", state: "AM", legalName: "Logística Exemplo Ltda",
      },
    });
    clienteId = cliente.id;
  }, PRAZO_MS);

  afterAll(async () => {
    // O event_log é só de inserção: o rastro fica, apontando para ids únicos.
    await prisma.deal.deleteMany({ where: { title: { startsWith: marca } } });
    await prisma.pipeline.deleteMany({ where: { name: { startsWith: marca } } });
    await prisma.client.deleteMany({ where: { name: { startsWith: marca } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: marca } } });
    await prisma.$disconnect();
  }, PRAZO_MS);

  it("detalhe real respeita acesso atual do CRM e oculta leitura, histórico e edição sem acesso", async () => {
    const criado = await novo();
    const detalhe = await negocios.get(criado.id, pessoas.pluggaVendedor);
    expect(detalhe).toMatchObject({ id: criado.id, title: criado.title, lead: criado.lead, version: expect.any(Number) });
    const antes = await prisma.eventLog.count({ where: { entityId: criado.id } });
    await expect(negocios.get(criado.id, pessoas.forasteiro)).rejects.toBeInstanceOf(NaoEncontrado);
    await expect(negocios.history(criado.id, { limit: 30 }, pessoas.forasteiro)).rejects.toBeInstanceOf(NaoEncontrado);
    await expect(negocios.update(criado.id, { title: "Não autorizado" }, pessoas.forasteiro)).rejects.toBeInstanceOf(NaoEncontrado);
    expect((await negocios.get(criado.id, pessoas.ana)).title).toBe(criado.title);
    expect(await prisma.eventLog.count({ where: { entityId: criado.id } })).toBe(antes);
  });

  it("edita dados comerciais, origem/endereço/complemento e contato próprio com antes/depois", async () => {
    const criado = await novo({ contact: { name: "Contato inicial", phone: "92999991111" } });
    const detalhe = await negocios.get(criado.id, pessoas.ana);
    const atualizado = await negocios.update(criado.id, updateLeadRequestSchema.parse({
      version: detalhe.version, title: `${marca} Título alterado`, value: "850.5", expectedCloseDate: "2028-02-29",
      ownerId: pessoas.bruno.id, tagIds: [solar.tags[0]!.id],
      lead: { origin: "indicacao", street: "Rua de teste", addressComplement: "Sala sintética", postalCode: "69000000" },
      contact: { name: "Contato alterado", phone: "92999992222", phoneIsWhatsapp: true },
    }), pessoas.ana);
    expect(atualizado).toMatchObject({ value: "850.50", expectedCloseDate: "2028-02-29", owner: { id: pessoas.bruno.id },
      lead: { origin: "indicacao", addressComplement: "Sala sintética" }, contact: { name: "Contato alterado", phoneIsWhatsapp: true } });
    expect(atualizado.version).toBeGreaterThan(detalhe.version);
    const historico = await negocios.history(criado.id, { limit: 100 }, pessoas.ana);
    expect(historico.entries).toContainEqual(expect.objectContaining({ kind: "field_changed", field: "value", before: "620000.00", after: "850.50", actor: { id: pessoas.ana.id, name: expect.any(String) } }));
    expect(historico.entries).toContainEqual(expect.objectContaining({ field: "lead.addressComplement", before: null, after: "Sala sintética" }));
    expect(historico.entries).toContainEqual(expect.objectContaining({ field: "contact.phone", before: "92999991111", after: "92999992222" }));
    const eventos = await prisma.eventLog.findMany({ where: { entityId: criado.id, eventName: "commercial.deal.updated" } });
    expect(JSON.stringify(eventos.map((e) => e.payload))).not.toContain("Sala sintética");
  });

  it("persiste qualificação própria sem contato, audita, preserva omissão e permite limpar", async () => {
    const campos = { companyName: "Empresa sintética", landlinePhone: "9233334444", website: "https://example.com", mainInterest: "Solar", jobTitle: "Diretora" };
    const criado = await novo({ lead: { personType: "pf", name: `${marca} Qualificação`, phone: "92999990000", ...campos } });
    const outro = await novo();
    const detalhe = await negocios.get(criado.id, pessoas.ana);
    expect(detalhe).toMatchObject({ lead: campos, contact: null });
    const mudancas = { companyName: "Outra empresa", landlinePhone: "(92) 3333-5555", website: "http://example.org", mainInterest: "Mercado livre", jobTitle: "Gerente" };
    const normalizado = { ...mudancas, landlinePhone: "9233335555" };
    const atualizado = await negocios.update(criado.id, updateLeadRequestSchema.parse({ version: detalhe.version, lead: mudancas }), pessoas.ana);
    expect((await negocios.get(criado.id, pessoas.ana)).lead).toMatchObject(normalizado);
    expect(atualizado.version).toBeGreaterThan(detalhe.version);
    const historico = await negocios.history(criado.id, { limit: 100 }, pessoas.ana);
    for (const campo of Object.keys(campos) as Array<keyof typeof campos>) {
      expect(historico.entries).toContainEqual(expect.objectContaining({ field: `lead.${campo}`, before: campos[campo], after: normalizado[campo] }));
    }
    const eventos = await prisma.eventLog.findMany({ where: { entityId: criado.id, eventName: "commercial.deal.updated" } });
    expect(eventos).toHaveLength(1);
    expect(JSON.stringify(eventos[0]!.payload)).not.toContain("Outra empresa");
    const noop = await negocios.update(criado.id, updateLeadRequestSchema.parse({ version: atualizado.version, lead: mudancas }), pessoas.ana);
    expect(noop.version).toBe(atualizado.version);
    const omitido = await negocios.update(criado.id, { version: atualizado.version, lead: { notes: "Preserva qualificação" } }, pessoas.ana);
    expect(omitido.lead).toMatchObject(normalizado);
    await expect(negocios.update(criado.id, { version: detalhe.version, lead: { jobTitle: "Versão antiga" } }, pessoas.ana)).rejects.toBeInstanceOf(EstadoInvalido);
    await expect(negocios.update(criado.id, { version: omitido.version, lead: { companyName: "Proibido" } }, pessoas.forasteiro)).rejects.toBeInstanceOf(NaoEncontrado);
    const limpo = await negocios.update(criado.id, updateLeadRequestSchema.parse({ version: omitido.version,
      lead: { companyName: null, landlinePhone: "", website: " ", mainInterest: null, jobTitle: "" },
    }), pessoas.ana);
    expect(limpo.lead).toMatchObject({ companyName: null, landlinePhone: null, website: null, mainInterest: null, jobTitle: null });
    expect((await negocios.get(outro.id, pessoas.ana)).lead).toMatchObject({ companyName: null, landlinePhone: null, website: null, mainInterest: null, jobTitle: null });
    expect((await negocios.history(criado.id, { limit: 100 }, pessoas.ana)).entries).toContainEqual(expect.objectContaining({ field: "lead.jobTitle", before: "Gerente", after: null }));
  });

  it("no-op normalizado não escreve versão, histórico nem auditoria, inclusive contato e etiquetas", async () => {
    const criado = await novo({ tagIds: [solar.tags[0]!.id, solar.tags[1]!.id], contact: { name: "Contato", phone: "92999991111" } });
    const detalhe = await negocios.get(criado.id, pessoas.ana);
    const antes = await prisma.eventLog.count({ where: { entityId: criado.id } });
    const atualizado = await negocios.update(criado.id, updateLeadRequestSchema.parse({ version: detalhe.version,
      title: detalhe.title, value: "620000", lead: { phone: "(92) 99999-0000" }, contact: { name: "Contato", phone: "(92) 99999-1111" },
      tagIds: [solar.tags[1]!.id, solar.tags[0]!.id],
    }), pessoas.ana);
    expect(atualizado.version).toBe(detalhe.version);
    expect(await prisma.dealHistory.count({ where: { dealId: criado.id } })).toBe(1);
    expect(await prisma.eventLog.count({ where: { entityId: criado.id } })).toBe(antes);
  });

  it("duas edições concorrentes da mesma versão têm um sucesso e um conflito", async () => {
    const criado = await novo();
    const detalhe = await negocios.get(criado.id, pessoas.ana);
    const resultados = await Promise.allSettled([
      negocios.update(criado.id, { version: detalhe.version, lead: { notes: "Primeira" } }, pessoas.ana),
      negocios.update(criado.id, { version: detalhe.version, lead: { notes: "Segunda" } }, pessoas.bruno),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const falhas = resultados.filter((r) => r.status === "rejected");
    expect(falhas).toHaveLength(1);
    expect(falhas[0]).toMatchObject({ reason: expect.any(EstadoInvalido) });
    expect(await prisma.dealHistory.count({ where: { dealId: criado.id, kind: "field_changed" } })).toBe(1);
  });

  it("falha transacional da auditoria reverte dados, versão e histórico", async () => {
    const criado = await novo();
    const detalhe = await negocios.get(criado.id, pessoas.ana);
    const falha = new AuditAppender();
    falha.append = async () => { throw new Error("falha sintética de auditoria"); };
    const repositorio = new PrismaNegociosRepository(prisma, falha, clientes);
    await expect(repositorio.update(criado.id, { version: detalhe.version, title: `${marca} Reverter`, lead: { notes: "Reverter" } }, pessoas.ana)).rejects.toThrow("falha sintética");
    expect(await negocios.get(criado.id, pessoas.ana)).toEqual(detalhe);
    expect(await prisma.dealHistory.count({ where: { dealId: criado.id } })).toBe(1);
  });

  it("histórico pagina sem repetição, inclusive horários iguais, e recusa cursor de outro negócio", async () => {
    const criado = await novo();
    await negocios.update(criado.id, { title: `${marca} Paginação`, value: "100" }, pessoas.ana);
    await negocios.moveStage(criado.id, { stageId: etapa("Visita técnica") }, pessoas.ana);
    await negocios.win(criado.id, ganhar(), pessoas.ana);
    await prisma.dealHistory.updateMany({ where: { dealId: criado.id }, data: { occurredAt: new Date("2026-11-02T00:00:00Z") } });
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const pagina = await negocios.history(criado.id, { cursor, limit: 2 }, pessoas.ana);
      ids.push(...pagina.entries.map((e) => e.id));
      cursor = pagina.nextCursor ?? undefined;
    } while (cursor);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort().reverse());
    const outro = await novo();
    await expect(negocios.history(outro.id, { cursor: ids[0], limit: 2 }, pessoas.ana)).rejects.toBeInstanceOf(RequisicaoInvalida);
  });

  it("limpa campos e contato, preserva omissões e audita null sem depender de cliente", async () => {
    const criado = await novo({ contact: { name: "Contato", phone: "92999991111", email: "contato@teste.local" } });
    const detalhe = await negocios.get(criado.id, pessoas.ana);
    const limpo = await negocios.update(criado.id, updateLeadRequestSchema.parse({ version: detalhe.version,
      value: null, expectedCloseDate: null, lead: { addressComplement: "Complemento" }, contact: { name: "Contato", phone: null },
    }), pessoas.ana);
    expect(limpo).toMatchObject({ value: null, expectedCloseDate: null, contact: { phone: null, email: "contato@teste.local" } });
    expect((await negocios.history(criado.id, { limit: 100 }, pessoas.ana)).entries).toContainEqual(expect.objectContaining({ field: "contact.phone", before: "92999991111", after: null }));
    const removido = await negocios.update(criado.id, { version: limpo.version, contact: null }, pessoas.ana);
    expect(removido.contact).toBeNull();
    expect(removido.lead.addressComplement).toBe("Complemento");
  });

  it("nega etiquetas de outro pipeline e pessoa sem acesso, sem alteração parcial", async () => {
    const criado = await novo();
    const detalhe = await negocios.get(criado.id, pessoas.ana);
    await expect(negocios.update(criado.id, { version: detalhe.version, title: `${marca} Inválido`, tagIds: [mercadoLivre.tags[0]!.id] }, pessoas.ana)).rejects.toBeInstanceOf(RequisicaoInvalida);
    await expect(negocios.update(criado.id, { version: detalhe.version, ownerId: pessoas.forasteiro.id }, pessoas.ana)).rejects.toBeInstanceOf(RequisicaoInvalida);
    await expect(negocios.update(criado.id, { version: detalhe.version, lead: { personType: "pf" }, contact: { name: "Contato proibido PF" } }, pessoas.ana)).rejects.toBeInstanceOf(RequisicaoInvalida);
    expect(await negocios.get(criado.id, pessoas.ana)).toEqual(detalhe);
    expect(await prisma.dealHistory.count({ where: { dealId: criado.id } })).toBe(1);
  });

  it("prioridade, etapa, ganho, perda e lote invalidam versões antigas; lote no-op não invalida", async () => {
    const criado = await novo();
    let atual = await negocios.get(criado.id, pessoas.ana);
    const mudar = async (acao: () => Promise<unknown>) => {
      const anterior = atual;
      await acao();
      atual = await negocios.get(criado.id, pessoas.ana);
      expect(atual.version).toBeGreaterThan(anterior.version);
      await expect(negocios.update(criado.id, { version: anterior.version, lead: { notes: "Versão vencida" } }, pessoas.ana)).rejects.toBeInstanceOf(EstadoInvalido);
    };
    await mudar(() => negocios.setPriority(criado.id, { priority: "urgente" }, pessoas.ana));
    await mudar(() => negocios.moveStage(criado.id, { stageId: etapa("Visita técnica") }, pessoas.ana));
    await mudar(() => negocios.bulk({ dealIds: [criado.id], action: { type: "owner", ownerId: pessoas.bruno.id } }, pessoas.ana));
    await mudar(() => negocios.bulk({ dealIds: [criado.id], action: { type: "tag", tagId: solar.tags[0]!.id } }, pessoas.ana));
    const antesNoop = atual;
    const tamanhoHistorico = await prisma.dealHistory.count({ where: { dealId: criado.id } });
    await negocios.bulk({ dealIds: [criado.id], action: { type: "owner", ownerId: pessoas.bruno.id } }, pessoas.ana);
    await negocios.bulk({ dealIds: [criado.id], action: { type: "tag", tagId: solar.tags[0]!.id } }, pessoas.ana);
    expect((await negocios.get(criado.id, pessoas.ana)).version).toBe(antesNoop.version);
    expect(await prisma.dealHistory.count({ where: { dealId: criado.id } })).toBe(tamanhoHistorico);
    await mudar(() => negocios.win(criado.id, ganhar(), pessoas.ana));
    const perdido = await novo();
    const antesPerda = await negocios.get(perdido.id, pessoas.ana);
    await negocios.lose(perdido.id, { lossReasonId: solar.lossReasons[0]!.id, note: "Nota sintética" }, pessoas.ana);
    expect(await negocios.get(perdido.id, pessoas.ana)).toMatchObject({ status: "lost", lossNote: "Nota sintética", version: expect.any(Number) });
    expect((await negocios.get(perdido.id, pessoas.ana)).version).toBeGreaterThan(antesPerda.version);
  });

  it(
    "a vendedora cria o lead, já com cliente vinculado e contato próprio; a equipe toda o vê, quem está fora não",
    async () => {
      const negocio = await novo({
        clientId: clienteId,
        contact: { name: "Juliana Prado" },
        tagIds: [solar.tags[0]!.id],
      });

      expect(negocio).toMatchObject({ status: "open", companyId: "waze", value: "620000.00", expectedCloseDate: "2026-12-15" });
      expect(negocio.contact?.name).toBe("Juliana Prado");
      expect(negocio.lead).toMatchObject({ personType: "pj", name: `${marca} Lead`, phone: "92999990000" });
      expect(negocio.client).toEqual({ id: clienteId, name: `${marca} Logística Igarapé` });
      expect(negocio.tags.map((t) => t.name)).toEqual(["Grupo A"]);

      const doBruno = await negocios.list({ pipelineId: solar.id, status: "open" }, pessoas.bruno);
      expect(doBruno.deals.map((d) => d.id)).toContain(negocio.id);
      expect(doBruno.deals.find((d) => d.id === negocio.id)?.client).toEqual(negocio.client);
      await expect(negocios.list({ pipelineId: solar.id, status: "open" }, pessoas.forasteiro)).rejects.toBeInstanceOf(NaoEncontrado);

      const historico = await prisma.dealHistory.findMany({ where: { dealId: negocio.id } });
      expect(historico).toMatchObject([{ kind: "created", toStageName: "Qualificação", actorId: pessoas.ana.id }]);
      expect(await prisma.eventLog.count({ where: { eventName: "commercial.deal.created", entityId: negocio.id } })).toBe(1);
    },
    PRAZO_MS,
  );

  it(
    "sem clientId o lead nasce sem cliente; recusa responsável sem acesso ao CRM e cliente inexistente",
    async () => {
      const semCliente = await novo();
      expect(semCliente.client).toBeNull();
      await expect(novo({ ownerId: pessoas.forasteiro.id })).rejects.toBeInstanceOf(RequisicaoInvalida);
      await expect(novo({ clientId: randomUUID() })).rejects.toBeInstanceOf(RequisicaoInvalida);
      await expect(novo({ stageId: mercadoLivre.stages[0]!.id })).rejects.toBeInstanceOf(RequisicaoInvalida);
    },
    PRAZO_MS,
  );

  it("grava, limpa e altera prioridades em lote apenas em negócios abertos", async () => {
    const primeiro = await novo({ priority: "urgente" });
    const segundo = await novo();
    expect(primeiro.priority).toBe("urgente");
    expect(segundo.priority).toBeNull();
    expect((await negocios.setPriority(primeiro.id, { priority: null }, pessoas.ana)).priority).toBeNull();
    await negocios.bulk({ dealIds: [primeiro.id, segundo.id], action: { type: "priority", priority: "medio" } }, pessoas.ana);
    const historico = await prisma.dealHistory.findMany({ where: { dealId: primeiro.id, kind: "priority_changed" }, orderBy: { occurredAt: "asc" } });
    expect(historico.map(({ fromPriority, toPriority }) => [fromPriority, toPriority])).toEqual([["urgente", null], [null, "medio"]]);
    await negocios.win(segundo.id, ganhar(), pessoas.ana);
    await expect(negocios.setPriority(segundo.id, { priority: "normal" }, pessoas.ana)).rejects.toBeInstanceOf(EstadoInvalido);
    await expect(negocios.bulk({ dealIds: [primeiro.id, segundo.id], action: { type: "priority", priority: "normal" } }, pessoas.ana)).rejects.toBeInstanceOf(EstadoInvalido);
    expect((await negocios.list({ pipelineId: solar.id, status: "open" }, pessoas.ana)).deals.find((d) => d.id === primeiro.id)?.priority).toBe("medio");
    await expect(negocios.setPriority(primeiro.id, { priority: "normal" }, pessoas.forasteiro)).rejects.toBeInstanceOf(NaoEncontrado);
  });

  it("gera números únicos globalmente em criações concorrentes entre pipelines", async () => {
    const negociosCriados = await Promise.all(Array.from({ length: 12 }, (_, indice) => novo(indice % 2 === 0 ? {} : {
      pipelineId: mercadoLivre.id,
      stageId: mercadoLivre.stages[0]!.id,
    })));
    const numeros = negociosCriados.map((negocio) => negocio.number);
    expect(numeros.every((numero) => Number.isInteger(numero) && numero > 0)).toBe(true);
    expect(new Set(numeros).size).toBe(negociosCriados.length);
    const salvos = await prisma.deal.findMany({ where: { id: { in: negociosCriados.map((negocio) => negocio.id) } }, select: { number: true } });
    expect(salvos.map((negocio) => negocio.number).sort((a, b) => a - b)).toEqual([...numeros].sort((a, b) => a - b));
  });

  it("persiste ordem, respeita referência e rebalanceia quando o espaço acaba", async () => {
    const a = await novo();
    const b = await novo();
    const c = await novo();
    const ids = [a.id, b.id, c.id];
    const ordem = async () => (await negocios.list({ pipelineId: solar.id, status: "open" }, pessoas.ana)).deals.filter((n) => ids.includes(n.id)).map((n) => n.id);
    expect(await ordem()).toEqual([c.id, b.id, a.id]);
    const antes = await prisma.deal.findUniqueOrThrow({ where: { id: a.id } });
    await negocios.moveStage(a.id, { stageId: a.stageId, beforeDealId: c.id }, pessoas.ana);
    expect(await ordem()).toEqual([a.id, c.id, b.id]);
    await negocios.moveStage(a.id, { stageId: a.stageId, beforeDealId: null }, pessoas.ana);
    expect(await ordem()).toEqual([c.id, b.id, a.id]);
    await negocios.moveStage(a.id, { stageId: a.stageId }, pessoas.ana);
    expect(await ordem()).toEqual([c.id, b.id, a.id]);
    const depois = await prisma.deal.findUniqueOrThrow({ where: { id: a.id } });
    expect(depois.stageEnteredAt).toEqual(antes.stageEnteredAt);
    expect(await prisma.dealHistory.count({ where: { dealId: a.id, kind: "stage_changed" } })).toBe(0);
    await expect(negocios.moveStage(a.id, { stageId: a.stageId, beforeDealId: a.id }, pessoas.ana)).rejects.toBeInstanceOf(RequisicaoInvalida);
    await prisma.deal.update({ where: { id: c.id }, data: { position: "10" } });
    await prisma.deal.update({ where: { id: b.id }, data: { position: "10.0000000001" } });
    await negocios.moveStage(a.id, { stageId: a.stageId, beforeDealId: b.id }, pessoas.ana);
    expect(await ordem()).toEqual([c.id, a.id, b.id]);
    const posicoes = await prisma.deal.findMany({ where: { id: { in: ids } }, select: { position: true } });
    expect(new Set(posicoes.map((p) => p.position.toString())).size).toBe(3);
  });

  it("serializa movimentos simultâneos para a mesma etapa", async () => {
    const referencia = await novo();
    const a = await novo({ stageId: etapa("Visita técnica") });
    const b = await novo({ stageId: etapa("Visita técnica") });
    await Promise.all([a, b].map((n, index) => negocios.moveStage(n.id, { stageId: referencia.stageId, beforeDealId: referencia.id }, index === 0 ? pessoas.ana : pessoas.bruno)));
    const encontrados = (await negocios.list({ pipelineId: solar.id, status: "open" }, pessoas.ana)).deals.filter((n) => [a.id, b.id, referencia.id].includes(n.id));
    expect(new Set(encontrados.slice(0, 2).map((n) => n.id))).toEqual(new Set([a.id, b.id]));
    expect(encontrados[2]?.id).toBe(referencia.id);
    const posicoes = await prisma.deal.findMany({ where: { id: { in: [a.id, b.id, referencia.id] } }, select: { position: true } });
    expect(new Set(posicoes.map((p) => p.position.toString())).size).toBe(3);
  });

  it("transfere simultaneamente negócios em sentidos opostos sem deadlock", async () => {
    const naSolar = await novo();
    const noMercado = await novo({ pipelineId: mercadoLivre.id, stageId: mercadoLivre.stages[0]!.id });
    const [paraMercado, paraSolar] = await Promise.all([
      negocios.transfer(naSolar.id, transferDealRequestSchema.parse({ pipelineId: mercadoLivre.id, stageId: mercadoLivre.stages[0]!.id }), pessoas.ana),
      negocios.transfer(noMercado.id, transferDealRequestSchema.parse({ pipelineId: solar.id, stageId: etapa("Qualificação") }), pessoas.bruno),
    ]);
    expect(paraMercado.pipelineId).toBe(mercadoLivre.id);
    expect(paraSolar.pipelineId).toBe(solar.id);
  }, PRAZO_MS);

  it("preserva a ordem em mil inserções sucessivas no mesmo intervalo, com rebalanceamento", async () => {
    const antes = await novo();
    const ancora = await novo();
    await prisma.deal.update({ where: { id: antes.id }, data: { position: "10" } });
    await prisma.deal.update({ where: { id: ancora.id }, data: { position: "10.0000000001" } });
    const ids = Array.from({ length: 1000 }, () => randomUUID());
    await prisma.deal.createMany({ data: ids.map((id, index) => ({
      id, pipelineId: solar.id, stageId: etapa("Visita técnica"), clientId: clienteId,
      ownerId: pessoas.ana.id, title: `${marca} inserção ${index}`, position: index * 1024,
    })) });
    await prisma.leadProfile.createMany({ data: ids.map((dealId) => ({ dealId, personType: "pf" as const, name: `${marca} lead em massa` })) });
    for (const id of ids) {
      await negocios.moveStage(id, { stageId: ancora.stageId, beforeDealId: ancora.id }, pessoas.ana);
    }
    const ordenados = await prisma.deal.findMany({
      where: { id: { in: [antes.id, ...ids, ancora.id] } },
      orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true, position: true },
    });
    expect(ordenados.map((n) => n.id)).toEqual([antes.id, ...ids, ancora.id]);
    expect(new Set(ordenados.map((n) => n.position.toString())).size).toBe(1002);
    expect(ordenados[0]!.position.toString()).not.toBe("10");
    const listados = await negocios.list({ pipelineId: solar.id, status: "open" }, pessoas.ana);
    const selecionados = new Set([antes.id, ...ids, ancora.id]);
    expect(listados.deals.filter((n) => selecionados.has(n.id)).map((n) => n.id)).toEqual([antes.id, ...ids, ancora.id]);
  }, 180_000);

  it("lista negócios fechados com desempate determinístico por id em status all", async () => {
    const a = await novo();
    const b = await novo();
    await negocios.win(a.id, ganhar(), pessoas.ana);
    await negocios.win(b.id, ganhar(), pessoas.ana);
    await prisma.deal.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { position: "12345" } });
    const lista = await negocios.list({ pipelineId: solar.id, status: "all" }, pessoas.ana);
    expect(lista.deals.filter((n) => n.id === a.id || n.id === b.id).map((n) => n.id)).toEqual([a.id, b.id].sort());
  });

  it("criação, transferência e lote entram no topo preservando a ordem do lote", async () => {
    const etapaOrigem = etapa("Qualificação");
    const etapaDestino = etapa("Visita técnica");
    const antigo = await novo({ stageId: etapaDestino });
    const a = await novo({ stageId: etapaOrigem });
    const b = await novo({ stageId: etapaOrigem });
    await negocios.bulk({ dealIds: [a.id, b.id], action: { type: "stage", stageId: etapaDestino } }, pessoas.ana);
    const ids = [antigo.id, a.id, b.id];
    const ordem = async () => (await negocios.list({ pipelineId: solar.id, status: "open" }, pessoas.ana)).deals.filter((n) => ids.includes(n.id)).map((n) => n.id);
    expect(await ordem()).toEqual([b.id, a.id, antigo.id]);
    const transferido = await novo({ pipelineId: mercadoLivre.id, stageId: mercadoLivre.stages[0]!.id });
    await negocios.transfer(transferido.id, transferDealRequestSchema.parse({ pipelineId: solar.id, stageId: etapaDestino }), pessoas.ana);
    ids.push(transferido.id);
    expect((await ordem())[0]).toBe(transferido.id);
    const novoNoTopo = await novo({ stageId: etapaDestino });
    ids.push(novoNoTopo.id);
    expect((await ordem())[0]).toBe(novoNoTopo.id);
    await negocios.win(antigo.id, ganhar(), pessoas.ana);
    await expect(negocios.moveStage(a.id, { stageId: etapaDestino, beforeDealId: antigo.id }, pessoas.ana)).rejects.toBeInstanceOf(RequisicaoInvalida);
    await expect(negocios.moveStage(a.id, { stageId: etapaDestino, beforeDealId: etapaOrigem }, pessoas.ana)).rejects.toBeInstanceOf(RequisicaoInvalida);
  });

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
      await expect(negocios.transfer(criado.id, transferDealRequestSchema.parse({ pipelineId: mercadoLivre.id, stageId: mercadoLivre.stages[0]!.id, ownerId: usuario.id }), pessoas.ana)).rejects.toBeInstanceOf(RequisicaoInvalida);
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
      const ganho = await negocios.win(negocio.id, ganhar(), pessoas.ana);
      expect(ganho).toMatchObject({ status: "won", stageId: etapa("Qualificação") });
      expect(ganho.closedAt).not.toBeNull();
    },
    PRAZO_MS,
  );

  it(
    "mover para o pipeline da Plugga muda a empresa e mantém responsável elegível e histórico",
    async () => {
      const negocio = await novo({ tagIds: [solar.tags[0]!.id] });
      const destino = transferDealRequestSchema.parse({ pipelineId: mercadoLivre.id, stageId: mercadoLivre.stages[1]!.id });
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
      const ganho = await negocios.win((await novo()).id, ganhar(), pessoas.ana);
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

  describe("conversão do lead em cliente", () => {
    it("documento igual a um cliente existente vincula, sem sobrescrever dados nem mesclar contatos", async () => {
      const documento = gerarCpf();
      const existente = await prisma.client.create({ data: { name: `${marca} Já cadastrado`, document: documento, phone: "92988887777" } });
      const negocio = await novo({ stageId: etapa("Visita técnica"), lead: { personType: "pf", name: `${marca} Com documento`, document: documento, phone: "92999991111" } });

      const resultado = await negocios.convert(negocio.id, {}, pessoas.ana);
      expect(resultado.created).toBe(false);
      expect(resultado.client).toEqual({ id: existente.id, name: existente.name });
      expect(resultado.lead.client).toEqual({ id: existente.id, name: existente.name });

      const clienteRelido = await prisma.client.findUniqueOrThrow({ where: { id: existente.id } });
      expect(clienteRelido.name).toBe(existente.name);
      expect(await prisma.clientContact.count({ where: { clientId: existente.id } })).toBe(0);

      const historico = await prisma.dealHistory.findMany({ where: { dealId: negocio.id, kind: "client_converted" } });
      expect(historico).toHaveLength(1);
      expect(await prisma.eventLog.count({ where: { eventName: "commercial.deal.client_converted", entityId: negocio.id } })).toBe(1);

      // Idempotente: converter de novo não repete o histórico nem muda o vínculo.
      const segunda = await negocios.convert(negocio.id, {}, pessoas.ana);
      expect(segunda).toEqual(resultado);
      expect(await prisma.dealHistory.count({ where: { dealId: negocio.id, kind: "client_converted" } })).toBe(1);
    }, PRAZO_MS);

    it("sem documento e sem candidato, cria um cliente novo copiando perfil e contato", async () => {
      const marcador = randomUUID().slice(0, 8);
      const negocio = await novo({
        stageId: etapa("Visita técnica"),
        lead: { personType: "pj", name: `${marca} Novo ${marcador}`, email: `${marcador}@teste.local`, city: "Manaus" },
        contact: { name: "Contato do lead", email: `${marcador}-contato@teste.local` },
      });

      const resultado = await negocios.convert(negocio.id, {}, pessoas.ana);
      expect(resultado.created).toBe(true);

      const criado = await prisma.client.findUniqueOrThrow({ where: { id: resultado.client.id }, include: { contacts: true } });
      expect(criado).toMatchObject({ name: `${marca} Novo ${marcador}`, email: `${marcador}@teste.local`, city: "Manaus" });
      expect(criado.contacts).toHaveLength(1);
      expect(criado.contacts[0]).toMatchObject({ name: "Contato do lead", email: `${marcador}-contato@teste.local` });
    }, PRAZO_MS);

    it("sem documento e com candidato, não mescla sozinho: devolve os candidatos até a escolha explícita", async () => {
      const marcador = randomUUID().slice(0, 8);
      const parecido = await prisma.client.create({ data: { name: `${marca} Parecido ${marcador}`, phone: "92977776666" } });
      const negocio = await novo({ stageId: etapa("Visita técnica"), lead: { personType: "pf", name: `${marca} Parecido ${marcador}`, phone: "92977776666" } });

      const falha = await negocios.convert(negocio.id, {}, pessoas.ana).catch((erro) => erro);
      expect(falha).toBeInstanceOf(RequisicaoInvalida);
      expect((falha as RequisicaoInvalida & { extras?: { candidatos?: { id: string }[] } }).extras?.candidatos?.some((c) => c.id === parecido.id)).toBe(true);
      expect(await prisma.deal.findUniqueOrThrow({ where: { id: negocio.id } }).then((d) => d.clientId)).toBeNull();

      const vinculado = await negocios.convert(negocio.id, { resolution: { type: "link", clientId: parecido.id } }, pessoas.ana);
      expect(vinculado).toEqual({ created: false, client: { id: parecido.id, name: parecido.name }, lead: vinculado.lead });
      expect(vinculado.lead.client).toEqual({ id: parecido.id, name: parecido.name });
    }, PRAZO_MS);

    it("resolution create ignora os candidatos e cria mesmo assim", async () => {
      const marcador = randomUUID().slice(0, 8);
      await prisma.client.create({ data: { name: `${marca} Outro parecido ${marcador}`, phone: "92966665555" } });
      const negocio = await novo({ stageId: etapa("Visita técnica"), lead: { personType: "pf", name: `${marca} Outro parecido ${marcador}`, phone: "92966665555" } });

      const resultado = await negocios.convert(negocio.id, { resolution: { type: "create" } }, pessoas.ana);
      expect(resultado.created).toBe(true);
    }, PRAZO_MS);

    it("converte só com nome e CPF salvo, sem exigir telefone ou e-mail", async () => {
      const documento = gerarCpf();
      const negocio = await novo({ stageId: etapa("Visita técnica"), lead: { personType: "pf", name: `${marca} Só documento`, document: documento, phone: "92999991111" } });
      await prisma.leadProfile.update({ where: { dealId: negocio.id }, data: { phone: null } });

      const resultado = await negocios.convert(negocio.id, {}, pessoas.ana);
      expect(resultado.created).toBe(true);
      const cliente = await prisma.client.findUniqueOrThrow({ where: { id: resultado.client.id } });
      expect(cliente).toMatchObject({ name: negocio.lead.name, document: documento, phone: null, email: null });
      expect((await negocios.convert(negocio.id, {}, pessoas.ana)).client.id).toBe(cliente.id);
      expect(await prisma.dealHistory.count({ where: { dealId: negocio.id, kind: "client_converted" } })).toBe(1);
    }, PRAZO_MS);

    it("recusa conversão com nome vazio mesmo tendo telefone e e-mail salvos", async () => {
      const negocio = await novo({ stageId: etapa("Visita técnica"), lead: { personType: "pf", name: `${marca} Nome obrigatório`, phone: "92999991111", email: "lead@teste.local" } });
      await prisma.leadProfile.update({ where: { dealId: negocio.id }, data: { name: "   " } });

      await expect(negocios.convert(negocio.id, {}, pessoas.ana)).rejects.toBeInstanceOf(RequisicaoInvalida);
      expect(await prisma.deal.findUniqueOrThrow({ where: { id: negocio.id } }).then((d) => d.clientId)).toBeNull();
      expect(await prisma.dealHistory.count({ where: { dealId: negocio.id, kind: "client_converted" } })).toBe(0);
    }, PRAZO_MS);

    it("sem telefone, e-mail ou documento, a conversão falha e nada muda", async () => {
      // create() já exige telefone ou e-mail; o defeito é simulado direto no banco
      // para provar que converter() também guarda essa regra, não só a criação.
      const negocio = await novo({ stageId: etapa("Visita técnica"), lead: { personType: "pf", name: `${marca} Com contato`, phone: "92900001111" } });
      await prisma.leadProfile.update({ where: { dealId: negocio.id }, data: { phone: null } });
      await expect(negocios.convert(negocio.id, {}, pessoas.ana)).rejects.toBeInstanceOf(RequisicaoInvalida);
      expect(await prisma.deal.findUniqueOrThrow({ where: { id: negocio.id } }).then((d) => d.clientId)).toBeNull();
    }, PRAZO_MS);

    it("ganhar com convertToClient converte na mesma transação; sem o flag, não converte", async () => {
      const marcador = randomUUID().slice(0, 8);
      const semConverter = await novo({ stageId: etapa("Visita técnica"), lead: { personType: "pf", name: `${marca} Sem flag ${marcador}`, phone: "92955554444" } });
      const ganhoSemConverter = await negocios.win(semConverter.id, ganhar(false), pessoas.ana);
      expect(ganhoSemConverter.client).toBeNull();

      const comConverter = await novo({ stageId: etapa("Visita técnica"), lead: { personType: "pf", name: `${marca} Com flag ${marcador}`, phone: "92944443333" } });
      const ganhoComConverter = await negocios.win(comConverter.id, ganhar(true), pessoas.ana);
      expect(ganhoComConverter.status).toBe("won");
      expect(ganhoComConverter.client).not.toBeNull();
    }, PRAZO_MS);
  });
});
