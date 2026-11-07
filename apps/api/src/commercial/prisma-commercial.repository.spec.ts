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
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  const prisma = {
    ...banco,
    comContexto: vi.fn(<T>(fn: (tx: typeof banco) => Promise<T>) => fn(banco)),
  };
  return { prisma, gravar, repository: new PrismaCommercialRepository(prisma as unknown as PrismaService, new AuditAppender()) };
}

const soPipelines: AuthPrincipal = { ...membro, acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }] } };
const soContratos: AuthPrincipal = { ...membro, acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.contratos"] }] } };
const semTela: AuthPrincipal = { ...membro, acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: [] }] } };

describe("Comercial: conteudo da tela autorizada", () => {
  it("ownerId opcional e um filtro de busca, sem isolamento pelo responsavel", async () => {
    const { prisma, repository } = contexto();
    await repository.listOpportunities({ ownerId: outroId }, membro);
    await repository.listContracts({ ownerId: outroId }, membro);
    for (const delegate of [prisma.opportunity, prisma.contract]) {
      const where = delegate.findMany.mock.calls[0]?.[0].where;
      expect(where).toMatchObject({ AND: { ownerId: outroId } });
      expect(where).not.toHaveProperty("ownerId");
    }
  });

  it("Membros do CRM ou Financeiro leem os contratos da tela sem filtro individual", async () => {
    const { prisma, repository } = contexto();
    for (const departamento of ["crm", "financeiro"] as const) {
      await repository.listContracts({}, { ...membro, acesso: { plataforma: null, departamentos: [{ departamento, nivel: "membro" }] } });
    }
    for (const [args] of prisma.contract.findMany.mock.calls) {
      expect(args.where).not.toHaveProperty("ownerId");
      expect(args.where).not.toHaveProperty("client");
    }
  });

  it("sem a tela pertinente recusa leitura e operacoes antes de consultar o banco", async () => {
    const { prisma, gravar, repository } = contexto();
    const acoes = [
      () => repository.listOpportunities({}, soContratos),
      () => repository.opportunity(outroId, soContratos),
      () => repository.listContracts({}, soPipelines),
      () => repository.contract(outroId, soPipelines),
      () => repository.createOpportunity({ title: "Sintetico", product: "OPM", ownerId: membro.id, nextActionAt: "2026-12-01T00:00:00.000Z" }, semTela),
      () => repository.updateOpportunityStage(outroId, { stage: "decisao" }, semTela),
      () => repository.registerOpportunityContact(outroId, { channel: "phone", outcome: "connected" }, semTela),
      () => repository.winOpportunity(outroId, { clientId: outroId }, semTela),
      () => repository.loseOpportunity(outroId, { lossReason: "Sintetico" }, semTela),
      () => repository.revisitOpportunity(outroId, { nextActionAt: "2026-12-01T00:00:00.000Z", nextActionNote: "Retomar" }, semTela),
      () => repository.createContract({ clientId: outroId }, semTela),
      () => repository.updateContractStatus(outroId, { status: "encerrado" }, semTela),
    ];
    for (const acao of acoes) await expect(acao()).rejects.toBeInstanceOf(AcessoNegado);
    for (const delegate of [prisma.opportunity, prisma.contract]) {
      expect(delegate.findUnique).not.toHaveBeenCalled();
      expect(delegate.findMany).not.toHaveBeenCalled();
    }
    expect(gravar).not.toHaveBeenCalled();
  });

  it("Pipelines nao inclui dados do cliente nem contratos de uma tela nao concedida", async () => {
    const { prisma, repository } = contexto();
    await repository.listOpportunities({}, soPipelines);
    const include = prisma.opportunity.findMany.mock.calls[0]?.[0].include;
    expect(include.client.where).toEqual({ id: { in: [] } });
    expect(include.contracts.where).toEqual({ id: { in: [] } });
    await repository.listOpportunities({}, membro);
    const autorizado = prisma.opportunity.findMany.mock.calls[1]?.[0].include;
    expect(autorizado.client.where).toEqual({});
    expect(autorizado.contracts.where).toEqual({});
  });

  it("Contratos usa apenas a projecao id/nome do cliente, sem SELECT da relacao obrigatoria", async () => {
    const { prisma, repository } = contextoComHistorico();
    prisma.contract.findMany.mockResolvedValue([await prisma.contract.findUnique({ where: { id: registroId } })]);
    const result = await repository.listContracts({}, soContratos);
    expect(result.items[0]).toMatchObject({ id: registroId, clientId: clienteId, clientName: "Cliente sintetico" });
    expect(prisma.contract.findMany.mock.calls[0]?.[0].include).not.toHaveProperty("client");
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
  });

  it("Contratos nao inclui oportunidade sem a tela correspondente", async () => {
    const { prisma, repository } = contexto();
    await repository.listContracts({}, soContratos);
    expect(prisma.contract.findMany.mock.calls[0]?.[0].include.opportunity.where).toEqual({ id: { in: [] } });
  });

  it("consulta registros inexistentes por ID sem impor dono e sem gravar", async () => {
    const { prisma, gravar, repository } = contexto();
    const acoes = [
      () => repository.opportunity(outroId, membro),
      () => repository.contract(outroId, membro),
      () => repository.updateOpportunityStage(outroId, { stage: "decisao" }, membro),
      () => repository.registerOpportunityContact(outroId, { channel: "phone", outcome: "connected" }, membro),
      () => repository.winOpportunity(outroId, { clientId: outroId }, membro),
      () => repository.loseOpportunity(outroId, { lossReason: "Sintetico" }, membro),
      () => repository.revisitOpportunity(outroId, { nextActionAt: "2026-12-01T00:00:00.000Z", nextActionNote: "Retomar" }, membro),
      () => repository.updateContractStatus(outroId, { status: "encerrado" }, membro),
      () => repository.createContract({ opportunityId: outroId, ownerId: membro.id }, membro),
    ];
    for (const acao of acoes) await expect(acao()).rejects.toBeInstanceOf(NaoEncontrado);
    for (const delegate of [prisma.opportunity, prisma.contract]) {
      for (const [args] of delegate.findUnique.mock.calls) expect(args.where).toEqual({ id: outroId });
    }
    expect(gravar).not.toHaveBeenCalled();
  });

  it("Membro continua sem atribuir oportunidade a outra pessoa", async () => {
    const { prisma, repository } = contexto();
    await expect(repository.createOpportunity({ title: "Teste", product: "OPM", ownerId: outroId, nextActionAt: "2026-12-01T00:00:00.000Z" }, membro)).rejects.toBeInstanceOf(AcessoNegado);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("Pipelines nao permite consultar ou criar cliente pelo fluxo manual de oportunidade", async () => {
    const { prisma, gravar, repository } = contexto();
    await expect(repository.createOpportunity({ title: "Teste", product: "OPM", ownerId: membro.id, clientId: outroId, nextActionAt: "2026-12-01T00:00:00.000Z" }, soPipelines)).rejects.toBeInstanceOf(AcessoNegado);
    await expect(repository.winOpportunity(outroId, { clientId: outroId }, soPipelines)).rejects.toBeInstanceOf(AcessoNegado);
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
    expect(prisma.client.findMany).not.toHaveBeenCalled();
    expect(gravar).not.toHaveBeenCalled();
  });

  it("Contrato com tela propria valida o cliente por booleano sem abrir seu cadastro", async () => {
    const { prisma, repository } = contextoComHistorico();
    prisma.user.findFirst.mockResolvedValue({ id: membro.id });
    await expect(repository.createContract({ clientId: clienteId }, soContratos)).resolves.toMatchObject({ id: registroId });
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
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
  prisma.$queryRaw.mockImplementation(async (sql: TemplateStringsArray) => sql.join("").includes("clientes_dos_contratos")
    ? [{ contract_id: registroId, id: clienteId, name: "Cliente sintetico" }]
    : [{ permitido: true }]);
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
  it.each([undefined, outroId])("Membro opera registro de outro responsavel sem o reatribuir (%s)", async (ownerId) => {
    const acoes = [
      (repo: PrismaCommercialRepository) => repo.updateOpportunityStage(registroId, { stage: "decisao", ownerId }, membro),
      (repo: PrismaCommercialRepository) => repo.revisitOpportunity(registroId, { ownerId, nextActionAt: proximaAcao, nextActionNote: "Retomar" }, membro),
      (repo: PrismaCommercialRepository) => repo.updateContractStatus(registroId, { status: "revisao_interna", ownerId }, membro),
    ];
    for (const acao of acoes) {
      const { prisma, repository } = contextoComHistorico();
      await expect(acao(repository)).resolves.toMatchObject({ ownerId: outroId });
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
    }
  });

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
