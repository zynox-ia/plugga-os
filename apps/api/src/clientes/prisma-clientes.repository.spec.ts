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
  const gravar = vi.fn().mockRejectedValue(new Error("Gravação inesperada"));
  const banco = {
    client: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), create: gravar, update: gravar },
    clientContact: { findFirst: vi.fn().mockResolvedValue(null), create: gravar, update: gravar, updateMany: gravar, delete: gravar },
    user: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue({ id: membro.id }) },
    eventLog: { createMany: gravar },
  };
  const prisma = {
    ...banco,
    comContexto: vi.fn(<T>(fn: (tx: typeof banco) => Promise<T>) => fn(banco)),
  };
  return { prisma, gravar, repository: new PrismaClientesRepository(prisma as unknown as PrismaService, new AuditAppender()) };
}

const soPipelines: AuthPrincipal = { ...membro, acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }] } };

describe("Clientes: acesso por tela", () => {
  it("a tela Clientes não restringe a busca e as duplicatas ao próprio responsável", async () => {
    const { prisma, repository } = contexto();
    await repository.list({ q: "hotel" }, membro);
    await repository.duplicateCandidates({ email: "sintetico@teste.local" }, membro);
    for (const [args] of prisma.client.findMany.mock.calls) expect(args.where).not.toHaveProperty("ownerId");
  });

  it("mantém a busca de gestão sem restrição de dono", async () => {
    const { prisma, repository } = contexto();
    await repository.list({}, gerente);
    expect(prisma.client.findMany.mock.calls[0]?.[0].where).not.toHaveProperty("ownerId");
  });

  it("gerência de Pipelines e acesso a Energia não concedem o cadastro completo de Clientes", async () => {
    const { prisma, repository } = contexto();
    const misto: AuthPrincipal = { ...membro, acesso: { plataforma: null, departamentos: [
      { departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] },
      { departamento: "energia-opm", nivel: "membro" },
    ] } };
    await expect(repository.list({}, misto)).rejects.toBeInstanceOf(AcessoNegado);
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });

  it("limita opções de responsável ao próprio membro", async () => {
    const { prisma, repository } = contexto();
    await repository.owners(membro);
    expect(prisma.user.findMany.mock.calls[0]?.[0].where.id).toBe(membro.id);
    expect(prisma.user.findMany.mock.calls[0]?.[0].where.OR).toContainEqual({ departamentos: { some: { departamento: "crm", telas: { has: "crm.clientes" } } } });
  });

  it("consulta o ID na tela autorizada sem impor ownership individual", async () => {
    const { prisma, repository } = contexto();
    await expect(repository.get(outroId, membro)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(prisma.client.findUnique.mock.calls[0]?.[0].where).toEqual({ id: outroId });
  });

  it("sem Clientes bloqueia leitura, seleção, duplicatas, edição e contatos antes de consultar ou gravar", async () => {
    const { prisma, gravar, repository } = contexto();
    const acoes = [
      () => repository.list({}, soPipelines),
      () => repository.get(outroId, soPipelines),
      () => repository.selecaoNegocio({ q: "Sintético" }, soPipelines),
      () => repository.duplicateCandidates({ name: "Sintético" }, soPipelines),
      () => repository.owners(soPipelines),
      () => repository.create({ personType: "pj", name: "Sintético" }, soPipelines),
      () => repository.update(outroId, { name: "Alterado" }, soPipelines),
      () => repository.activate(outroId, soPipelines),
      () => repository.inactivate(outroId, {}, soPipelines),
      () => repository.addContact(outroId, { name: "Contato" }, soPipelines),
      () => repository.updateContact(outroId, outroId, { name: "Contato" }, soPipelines),
      () => repository.removeContact(outroId, outroId, soPipelines),
    ];
    for (const acao of acoes) await expect(acao()).rejects.toBeInstanceOf(AcessoNegado);
    expect(gravar).not.toHaveBeenCalled();
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
    expect(prisma.client.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("recusa atribuir um cliente novo a outra pessoa antes de consultar seus dados", async () => {
    const { prisma, gravar, repository } = contexto();
    await expect(repository.create({ personType: "pj", name: "Sintético", ownerId: outroId }, membro)).rejects.toBeInstanceOf(AcessoNegado);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(gravar).not.toHaveBeenCalled();
  });
});
