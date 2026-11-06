import { describe, expect, it, vi } from "vitest";

import { AuditAppender } from "../audit/audit-appender";
import { AcessoNegado, NaoEncontrado } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import type { PrismaService } from "../prisma/prisma.service";
import { PrismaClientesRepository } from "./prisma-clientes.repository";

const membro: AuthPrincipal = { id: "00000000-0000-4000-8000-000000000001", kind: "user", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro" }] } };
const gerente: AuthPrincipal = { ...membro, acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] } };
const outroId = "00000000-0000-4000-8000-000000000002";

function contexto() {
  const prisma = {
    client: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
    clientContact: { findFirst: vi.fn().mockResolvedValue(null) },
    user: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue({ id: membro.id }) },
    $transaction: vi.fn(),
  };
  return { prisma, repository: new PrismaClientesRepository(prisma as unknown as PrismaService, new AuditAppender()) };
}

describe("Clientes: isolamento por responsável", () => {
  it("aplica o escopo no banco antes da busca por nome, contatos e duplicatas", async () => {
    const { prisma, repository } = contexto();
    await repository.list({ q: "hotel" }, membro);
    await repository.duplicateCandidates({ email: "sintetico@teste.local" }, membro);
    expect(prisma.client.findMany.mock.calls.map(([args]) => args.where.ownerId)).toEqual([membro.id, membro.id]);
  });

  it("mantém a busca de gestão sem restrição de dono", async () => {
    const { prisma, repository } = contexto();
    await repository.list({}, gerente);
    expect(prisma.client.findMany.mock.calls[0]?.[0].where).not.toHaveProperty("ownerId");
  });

  it("não combina gerência sem tela de clientes com leitura de membro em Energia", async () => {
    const { prisma, repository } = contexto();
    const misto: AuthPrincipal = { ...membro, acesso: { plataforma: null, departamentos: [
      { departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] },
      { departamento: "energia-opm", nivel: "membro" },
    ] } };
    await repository.list({}, misto);
    expect(prisma.client.findMany.mock.calls[0]?.[0].where.ownerId).toBe(membro.id);
  });

  it("limita opções de responsável ao próprio membro", async () => {
    const { prisma, repository } = contexto();
    await repository.owners(membro);
    expect(prisma.user.findMany.mock.calls[0]?.[0].where.id).toBe(membro.id);
  });

  it("consulta o ID somente dentro do escopo obrigatório", async () => {
    const { prisma, repository } = contexto();
    await expect(repository.get(outroId, membro)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(prisma.client.findUnique.mock.calls[0]?.[0].where).toMatchObject({ id: outroId, ownerId: membro.id });
  });

  it("bloqueia ativação, edição e todos os contatos de cliente alheio antes de gravar", async () => {
    const { prisma, repository } = contexto();
    const acoes = [
      () => repository.update(outroId, { name: "Alterado" }, membro),
      () => repository.activate(outroId, membro),
      () => repository.inactivate(outroId, {}, membro),
      () => repository.addContact(outroId, { name: "Contato" }, membro),
      () => repository.updateContact(outroId, outroId, { name: "Contato" }, membro),
      () => repository.removeContact(outroId, outroId, membro),
    ];
    for (const acao of acoes) await expect(acao()).rejects.toBeInstanceOf(NaoEncontrado);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    for (const [args] of prisma.client.findUnique.mock.calls) expect(args.where.ownerId).toBe(membro.id);
  });

  it("recusa atribuir um cliente novo a outra pessoa antes de consultar seus dados", async () => {
    const { prisma, repository } = contexto();
    await expect(repository.create({ personType: "pj", name: "Sintético", ownerId: outroId }, membro)).rejects.toBeInstanceOf(AcessoNegado);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
