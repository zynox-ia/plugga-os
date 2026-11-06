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
    user: { findUnique: vi.fn().mockResolvedValue(null) },
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
