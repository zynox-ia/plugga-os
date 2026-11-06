import { afterEach, describe, expect, it, vi } from "vitest";

import type { LeadDocument } from "@plugga/shared";

import { EstadoInvalido, NaoEncontrado } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import * as access from "../pipelines/acesso-comercial";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaLeadPropostasRepository } from "./prisma-lead-propostas.repository";

const principal: AuthPrincipal = { id: "user", kind: "user", acesso: { plataforma: "admin", departamentos: [] } };
const content = { title: "Proposta", recipient: "João", company: "", email: "", phone: "", city: "", owner: "", jobTitle: "", amount: "100.00", validUntil: "2026-11-20", introduction: "", scope: "", payment: "", notes: "" };
const row = {
  id: "bead0000-0000-4000-8000-000000000003", dealId: "bead0000-0000-4000-8000-000000000004", templateId: "bead0000-0000-4000-8000-000000000001",
  number: 1, status: "draft", version: 0, revision: 1, content, generationToken: null, generationStartedAt: null,
  createdAt: new Date(), updatedAt: new Date(), versions: [],
  template: { id: "bead0000-0000-4000-8000-000000000001", name: "Essencial", style: "essencial", description: "Modelo", position: 0, defaults: { introduction: "Introdução padrão", scope: "Escopo padrão", payment: "Condições" } },
};

function setup() {
  const prisma = new PrismaService();
  vi.spyOn(prisma, "$queryRaw").mockResolvedValue([]);
  vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: unknown) => {
    if (typeof callback !== "function") throw new Error("Teste requer transação interativa.");
    return callback(prisma);
  });
  vi.spyOn(access, "lerAcessoComercial").mockResolvedValue({ podeOperar: true, admin: true, gestorEm: [] });
  const deal = vi.spyOn(prisma.deal, "findUnique").mockResolvedValue(null);
  deal.mockResolvedValue({
    profile: { name: "João", companyName: "Energia", email: "joao@example.test", phone: "92999999999", city: "Manaus", state: "AM", jobTitle: "Diretor", mainInterest: "Solar", notes: "Observações" },
    title: "Negócio", ownerId: principal.id, owner: { name: "André" }, value: { toFixed: () => "18500.00" },
  } as never);
  const read = vi.spyOn(prisma.leadProposal, "findFirst").mockResolvedValue(row as never);
  const write = vi.spyOn(prisma.leadProposal, "updateMany").mockResolvedValue({ count: 1 });
  const template = vi.spyOn(prisma.leadProposalTemplate, "findUnique").mockResolvedValue(row.template);
  const version = vi.spyOn(prisma.leadProposalVersion, "create").mockResolvedValue({} as never);
  return { repo: new PrismaLeadPropostasRepository(prisma), prisma, read, write, template, version, deal };
}

afterEach(() => vi.restoreAllMocks());

describe("Persistência das propostas: isolamento e concorrência", () => {
  it("consulta proposta sempre pelo negócio e devolve 404 para id alheio", async () => {
    const { repo, read } = setup();
    read.mockResolvedValue(null);
    await expect(repo.get(row.dealId, row.id, principal)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ where: { id: row.id, dealId: row.dealId } }));
  });
  it("recusa acesso revogado sem ler conteúdo da proposta", async () => {
    const { repo, read } = setup();
    vi.mocked(access.lerAcessoComercial).mockResolvedValue({ podeOperar: false, admin: false, gestorEm: [] });
    await expect(repo.get(row.dealId, row.id, principal)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(read).not.toHaveBeenCalled();
  });
  it("recusa todos os caminhos de proposta do negócio de outro membro, mesmo com papel antigo na sessão", async () => {
    const { repo, read, write, deal } = setup();
    deal.mockResolvedValue({ ownerId: "outro" } as never);
    vi.mocked(access.lerAcessoComercial).mockResolvedValue({ podeOperar: true, admin: false, gestorEm: [] });
    const operations = [
      () => repo.list(row.dealId, principal),
      () => repo.templates(row.dealId, principal),
      () => repo.get(row.dealId, row.id, principal),
      () => repo.create(row.dealId, { templateId: row.templateId, content }, principal),
      () => repo.update(row.dealId, row.id, { revision: 1, templateId: row.templateId, content }, principal),
      () => repo.beginGeneration(row.dealId, row.id, 1, principal),
      () => repo.completeGeneration(row.dealId, { proposal: row, token: "token" } as never, { id: "doc" } as LeadDocument, principal),
    ];
    for (const operation of operations) await expect(operation()).rejects.toBeInstanceOf(NaoEncontrado);
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
  it("reserva geração com CAS de revisão, estado e token livre", async () => {
    const { repo, write } = setup();
    const claim = await repo.beginGeneration(row.dealId, row.id, 1, principal);
    expect(claim.proposal).toMatchObject({ version: 0, revision: 1, status: "draft" });
    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: row.id, dealId: row.dealId, revision: 1, status: "draft", OR: expect.arrayContaining([{ generationToken: null }]) }),
      data: expect.objectContaining({ generationToken: claim.token, generationStartedAt: expect.any(Date) }),
    }));
    write.mockResolvedValue({ count: 0 });
    await expect(repo.beginGeneration(row.dealId, row.id, 1, principal)).rejects.toBeInstanceOf(EstadoInvalido);
  });
  it("edição usa CAS, mantém versões anteriores e volta a rascunho sem alterar o lead", async () => {
    const { repo, write, prisma } = setup();
    const dealWrite = vi.spyOn(prisma.deal, "update");
    await repo.update(row.dealId, row.id, { revision: 1, templateId: row.templateId, content: { ...content, notes: "" } }, principal);
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ revision: 1, OR: expect.any(Array) }), data: expect.objectContaining({ status: "draft", revision: { increment: 1 }, content: expect.objectContaining({ notes: "" }) }) }));
    expect(dealWrite).not.toHaveBeenCalled();
    write.mockResolvedValue({ count: 0 });
    await expect(repo.update(row.dealId, row.id, { revision: 1, templateId: row.templateId, content }, principal)).rejects.toBeInstanceOf(EstadoInvalido);
  });
  it("preenche os modelos persistidos com lead, oportunidade e data civil", async () => {
    const { repo, prisma } = setup();
    vi.spyOn(prisma.leadProposalTemplate, "findMany").mockResolvedValue([{ ...row.template, defaults: { ...row.template.defaults, recipient: "Outro", amount: "0.00", company: "Outra" } }]);
    const result = await repo.templates(row.dealId, principal);
    expect(result.templates[0]?.defaults).toMatchObject({ recipient: "João", amount: "18500.00", company: "Energia", owner: "André", scope: "Solar", notes: "Observações", jobTitle: "Diretor" });
    expect(result.templates[0]?.defaults.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("conclusão revalida acesso e falha antes de gravar versão", async () => {
    const { repo, version, write } = setup();
    const generation = await repo.beginGeneration(row.dealId, row.id, 1, principal);
    write.mockClear();
    vi.mocked(access.lerAcessoComercial).mockResolvedValue({ podeOperar: false, admin: false, gestorEm: [] });
    await expect(repo.completeGeneration(row.dealId, generation, { id: "doc" } as LeadDocument, principal)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(write).not.toHaveBeenCalled();
    expect(version).not.toHaveBeenCalled();
  });
  it("transferência do responsável durante a geração impede concluir o PDF", async () => {
    const { repo, version, write, deal } = setup();
    vi.mocked(access.lerAcessoComercial).mockResolvedValue({ podeOperar: true, admin: false, gestorEm: [] });
    const generation = await repo.beginGeneration(row.dealId, row.id, 1, principal);
    write.mockClear();
    deal.mockResolvedValue({ ownerId: "outro" } as never);
    await expect(repo.completeGeneration(row.dealId, generation, { id: "doc" } as LeadDocument, principal)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(write).not.toHaveBeenCalled();
    expect(version).not.toHaveBeenCalled();
  });
  it("token expirado não conclui por cima de outra tentativa e não grava versão", async () => {
    const { repo, prisma, write, version } = setup();
    const generation = await repo.beginGeneration(row.dealId, row.id, 1, principal);
    vi.spyOn(prisma.leadDocument, "findFirst").mockResolvedValue({ id: "doc" } as never);
    write.mockResolvedValue({ count: 0 });
    await expect(repo.completeGeneration(row.dealId, generation, { id: "doc" } as LeadDocument, principal)).rejects.toBeInstanceOf(EstadoInvalido);
    expect(version).not.toHaveBeenCalled();
    expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ generationToken: generation.token, revision: 1 }), data: expect.objectContaining({ version: { increment: 1 }, revision: { increment: 1 } }) }));
  });
});
