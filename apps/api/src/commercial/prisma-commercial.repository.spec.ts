import { describe, expect, it, vi } from "vitest";

import { AuditAppender } from "../audit/audit-appender";
import { AcessoNegado, NaoEncontrado } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import type { PrismaService } from "../prisma/prisma.service";
import { PrismaCommercialRepository } from "./prisma-commercial.repository";

const membro: AuthPrincipal = { id: "00000000-0000-4000-8000-000000000001", kind: "user", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro" }] } };
const outroId = "00000000-0000-4000-8000-000000000002";

function contexto() {
  const gravar = vi.fn().mockRejectedValue(new Error("Gravação inesperada"));
  const banco = {
    opportunity: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), create: gravar, updateMany: gravar },
    opportunityContact: { create: gravar },
    contract: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), create: gravar, updateMany: gravar },
    client: { findUnique: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]), create: gravar },
    user: { findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null) },
    eventLog: { createMany: gravar },
  };
  const prisma = {
    ...banco,
    comContexto: vi.fn(<T>(fn: (tx: typeof banco) => Promise<T>) => fn(banco)),
  };
  return { prisma, gravar, repository: new PrismaCommercialRepository(prisma as unknown as PrismaService, new AuditAppender()) };
}

describe("Comercial: isolamento por responsável", () => {
  it("o filtro opcional ownerId não substitui o escopo de oportunidades e contratos", async () => {
    const { prisma, repository } = contexto();
    await repository.listOpportunities({ ownerId: outroId }, membro);
    await repository.listContracts({ ownerId: outroId }, membro);
    for (const delegate of [prisma.opportunity, prisma.contract]) {
      const where = delegate.findMany.mock.calls[0]?.[0].where;
      expect(where).toMatchObject({ ownerId: membro.id, AND: { ownerId: outroId } });
    }
  });

  it("mantém o alcance de gestão do CRM e Financeiro", async () => {
    const { prisma, repository } = contexto();
    for (const departamento of ["crm", "financeiro"] as const) {
      const gerente: AuthPrincipal = { ...membro, acesso: { plataforma: null, departamentos: [{ departamento, nivel: "gerente" }] } };
      await repository.listContracts({}, gerente);
    }
    for (const [args] of prisma.contract.findMany.mock.calls) expect(args.where.ownerId).toBeUndefined();
  });

  it("gerência de outra tela do CRM não amplia leitura de membro no Financeiro", async () => {
    const { prisma, repository } = contexto();
    await repository.listContracts({}, { ...membro, acesso: { plataforma: null, departamentos: [
      { departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] },
      { departamento: "financeiro", nivel: "membro" },
    ] } });
    await repository.listOpportunities({}, { ...membro, acesso: { plataforma: null, departamentos: [
      { departamento: "crm", nivel: "gerente", telas: ["crm.contratos"] },
      { departamento: "financeiro", nivel: "membro" },
    ] } });
    expect(prisma.contract.findMany.mock.calls[0]?.[0].where.ownerId).toBe(membro.id);
    expect(prisma.opportunity.findMany.mock.calls[0]?.[0].where.ownerId).toBe(membro.id);
  });

  it("filtra clientes e contratos relacionados sem usar gerência de outra tela", async () => {
    const { prisma, repository } = contexto();
    await repository.listOpportunities({}, membro);
    const include = prisma.opportunity.findMany.mock.calls[0]?.[0].include;
    expect(include.client.where.ownerId).toBe(membro.id);
    expect(include.contracts.where.ownerId).toBe(membro.id);
  });

  it("exige também cliente próprio ao listar, detalhar ou alterar contrato de membro", async () => {
    const { prisma, gravar, repository } = contexto();
    await repository.listContracts({}, membro);
    await expect(repository.contract(outroId, membro)).rejects.toBeInstanceOf(NaoEncontrado);
    await expect(repository.updateContractStatus(outroId, { status: "revisao_interna" }, membro)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(prisma.contract.findMany.mock.calls[0]?.[0].where.client).toEqual({ ownerId: membro.id });
    for (const [args] of prisma.contract.findUnique.mock.calls) expect(args.where.client).toEqual({ ownerId: membro.id });
    expect(gravar).not.toHaveBeenCalled();
  });

  it("não restringe cliente do contrato quando há gestão autorizada da tela", async () => {
    const { prisma, repository } = contexto();
    await repository.listContracts({}, { ...membro, acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: ["crm.contratos"] }] } });
    expect(prisma.contract.findMany.mock.calls[0]?.[0].where.client).toBeUndefined();
  });

  it("filtra a oportunidade opcional vinculada ao contrato antes de expor seu ID", async () => {
    const { prisma, repository } = contexto();
    await repository.listContracts({}, membro);
    expect(prisma.contract.findMany.mock.calls[0]?.[0].include.opportunity?.where.ownerId).toBe(membro.id);
  });

  it("consulta detalhes e mutações somente dentro do escopo, antes de regras ou gravações", async () => {
    const { prisma, gravar, repository } = contexto();
    const acoes = [
      () => repository.opportunity(outroId, membro),
      () => repository.contract(outroId, membro),
      () => repository.updateOpportunityStage(outroId, { stage: "decisao" }, membro),
      () => repository.registerOpportunityContact(outroId, { channel: "phone", outcome: "connected" }, membro),
      () => repository.winOpportunity(outroId, { clientId: outroId }, membro),
      () => repository.loseOpportunity(outroId, { lossReason: "teste" }, membro),
      () => repository.revisitOpportunity(outroId, { nextActionAt: "2026-12-01T00:00:00.000Z", nextActionNote: "Retomar" }, membro),
      () => repository.updateContractStatus(outroId, { status: "encerrado" }, membro),
      () => repository.createContract({ opportunityId: outroId, ownerId: membro.id }, membro),
    ];
    for (const acao of acoes) await expect(acao()).rejects.toBeInstanceOf(NaoEncontrado);
    for (const delegate of [prisma.opportunity, prisma.contract]) {
      for (const [args] of delegate.findUnique.mock.calls) expect(args.where.ownerId).toBe(membro.id);
    }
    expect(gravar).not.toHaveBeenCalled();
  });

  it("recusa criar oportunidade atribuída a outra pessoa", async () => {
    const { prisma, repository } = contexto();
    await expect(repository.createOpportunity({ title: "Teste", product: "OPM", ownerId: outroId, nextActionAt: "2026-12-01T00:00:00.000Z" }, membro)).rejects.toBeInstanceOf(AcessoNegado);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("recusa vincular cliente alheio na criação", async () => {
    const { prisma, gravar, repository } = contexto();
    await expect(repository.createOpportunity({ title: "Teste", product: "OPM", ownerId: membro.id, clientId: outroId, nextActionAt: "2026-12-01T00:00:00.000Z" }, membro)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(prisma.client.findUnique.mock.calls[0]?.[0].where).toMatchObject({ id: outroId, ownerId: membro.id });
    expect(gravar).not.toHaveBeenCalled();
  });
});

const gerente: AuthPrincipal = { ...membro, acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] } };
const registroId = "00000000-0000-4000-8000-000000000003";
const clienteId = "00000000-0000-4000-8000-000000000004";
const proximaAcao = "2026-12-01T00:00:00.000Z";

function contextoComHistorico() {
  const contextoAtual = contexto();
  const { prisma } = contextoAtual;
  const agora = new Date("2026-11-06T12:00:00.000Z");
  const oportunidade = {
    id: registroId, title: "Oportunidade sintética", product: "OPM", stage: "qualificacao", status: "aberta",
    ownerId: outroId, owner: { id: outroId, name: "Responsável histórico" }, clientId: null, client: null,
    estimatedValue: null, nextActionAt: new Date(proximaAcao), nextActionNote: null, lossReason: null,
    decidedAt: null, createdAt: agora, updatedAt: agora, contacts: [], contracts: [],
  };
  const contrato = {
    id: registroId, status: "rascunho", ownerId: outroId, owner: oportunidade.owner,
    clientId: clienteId, client: { id: clienteId, name: "Cliente sintético" }, opportunityId: null, opportunity: null,
    startsAt: null, endsAt: null, signedAt: null, nextActionAt: new Date(proximaAcao), nextActionNote: null,
    createdAt: agora, updatedAt: agora,
  };
  prisma.opportunity.findUnique.mockResolvedValue(oportunidade);
  prisma.contract.findUnique.mockResolvedValue(contrato);
  prisma.client.findUnique.mockResolvedValue({ id: clienteId });
  prisma.opportunity.create = vi.fn().mockResolvedValue(oportunidade);
  prisma.contract.create = vi.fn().mockResolvedValue(contrato);
  prisma.opportunity.updateMany = vi.fn().mockResolvedValue({ count: 1 });
  prisma.contract.updateMany = vi.fn().mockResolvedValue({ count: 1 });
  prisma.eventLog.createMany = vi.fn().mockResolvedValue({ count: 1 });
  return contextoAtual;
}

const acoesDeAtribuicao = [
  { tela: "crm.pipelines", executar: (repo: PrismaCommercialRepository) => repo.createOpportunity({ title: "Sintético", product: "OPM", ownerId: outroId, nextActionAt: proximaAcao }, gerente) },
  { tela: "crm.pipelines", executar: (repo: PrismaCommercialRepository) => repo.updateOpportunityStage(registroId, { stage: "decisao", ownerId: membro.id }, gerente) },
  { tela: "crm.pipelines", executar: (repo: PrismaCommercialRepository) => repo.revisitOpportunity(registroId, { ownerId: membro.id, nextActionAt: proximaAcao, nextActionNote: "Retomar" }, gerente) },
  { tela: "crm.contratos", executar: (repo: PrismaCommercialRepository) => repo.createContract({ clientId: clienteId, ownerId: outroId }, gerente) },
  { tela: "crm.contratos", executar: (repo: PrismaCommercialRepository) => repo.updateContractStatus(registroId, { status: "revisao_interna", ownerId: membro.id }, gerente) },
] as const;

describe("Comercial: elegibilidade de novas atribuições", () => {
  it.each(["disabled", "removed", "active"])("não atribui a conta histórica %s sem concessão operacional", async (status) => {
    for (const acao of acoesDeAtribuicao) {
      const { prisma, repository } = contextoComHistorico();
      prisma.user.findUnique.mockResolvedValue({ id: outroId, status, platformRoles: [], departamentos: [] });
      // A conta existe no diretório histórico, mas nenhuma linha satisfaz a elegibilidade atual.
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(acao.executar(repository)).rejects.toBeInstanceOf(NaoEncontrado);
      expect(prisma.user.findFirst.mock.calls[0]?.[0].where).toMatchObject({
        status: "active",
        OR: expect.arrayContaining([
          { platformRoles: { some: { role: { key: { in: ["admin", "desenvolvedor"] } } } } },
          { departamentos: { some: { departamento: "crm", telas: { has: acao.tela } } } },
        ]),
      });
      for (const gravacao of [prisma.opportunity.create, prisma.contract.create, prisma.opportunity.updateMany, prisma.contract.updateMany, prisma.eventLog.createMany]) {
        expect(gravacao).not.toHaveBeenCalled();
      }
    }
  });

  it.each(["crm.pipelines", "crm.contratos"] as const)("aceita destinatário elegível para %s e exige a tela correspondente", async (tela) => {
    for (const acao of acoesDeAtribuicao.filter((item) => item.tela === tela)) {
      const { prisma, repository } = contextoComHistorico();
      prisma.user.findFirst.mockResolvedValue({ id: outroId });
      await expect(acao.executar(repository)).resolves.toMatchObject({ id: registroId });
      expect(prisma.user.findFirst.mock.calls[0]?.[0].where).toMatchObject({
        status: "active",
        OR: expect.arrayContaining([{ departamentos: { some: { departamento: "crm", telas: { has: tela } } } }]),
      });
      const gravacao = [prisma.opportunity.create, prisma.contract.create, prisma.opportunity.updateMany, prisma.contract.updateMany]
        .flatMap((delegate) => delegate.mock.calls).find(([args]) => args.data.ownerId !== undefined);
      expect(gravacao?.[0].data.ownerId).toBe(prisma.user.findFirst.mock.calls[0]?.[0].where.id);
    }
  });

  it.each(["admin", "desenvolvedor"])("aceita nova atribuição à plataforma %s sem departamento", async (papel) => {
    for (const acao of [acoesDeAtribuicao[0], acoesDeAtribuicao[3]]) {
      const { prisma, repository } = contextoComHistorico();
      prisma.user.findFirst.mockResolvedValue({ id: outroId });
      await expect(acao.executar(repository)).resolves.toMatchObject({ ownerId: outroId });
      expect(prisma.user.findFirst.mock.calls[0]?.[0].where).toMatchObject({
        id: outroId, status: "active",
        OR: expect.arrayContaining([{ platformRoles: { some: { role: { key: { in: expect.arrayContaining([papel]) } } } } }]),
      });
    }
  });

  it.each([undefined, outroId])("preserva responsável histórico quando o dono continua %s", async (ownerId) => {
    const acoes = [
      (repo: PrismaCommercialRepository) => repo.updateOpportunityStage(registroId, { stage: "decisao", ownerId }, gerente),
      (repo: PrismaCommercialRepository) => repo.revisitOpportunity(registroId, { ownerId, nextActionAt: proximaAcao, nextActionNote: "Retomar" }, gerente),
      (repo: PrismaCommercialRepository) => repo.updateContractStatus(registroId, { status: "revisao_interna", ownerId }, gerente),
    ];
    for (const acao of acoes) {
      const { prisma, repository } = contextoComHistorico();
      await expect(acao(repository)).resolves.toMatchObject({ ownerId: outroId, ownerName: "Responsável histórico" });
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    }
  });
});
