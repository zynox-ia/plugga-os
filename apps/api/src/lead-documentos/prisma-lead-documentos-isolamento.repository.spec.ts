import { Readable } from "node:stream";
import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditAppender } from "../audit/audit-appender";
import { NaoEncontrado } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import * as acesso from "../pipelines/acesso-comercial";
import { PrismaService } from "../prisma/prisma.service";
import { ArmazenamentoDeDocumentos } from "./armazenamento-de-documentos";
import { PrismaLeadDocumentosRepository } from "./prisma-lead-documentos.repository";

const principal: AuthPrincipal = { id: "00000000-0000-4000-8000-000000000001", kind: "user", acesso: { plataforma: "admin", departamentos: [] } };
const dealId = "00000000-0000-4000-8000-000000000002";
const autor = { id: "00000000-0000-4000-8000-000000000003", name: "Outra pessoa" };
const documento = {
  id: "00000000-0000-4000-8000-000000000004", dealId, category: "outros", originalName: "arquivo.pdf",
  sizeBytes: 100, detectedMime: "application/pdf", storageKey: "chave-sintetica", uploadState: "ready",
  uploadedById: autor.id, uploadedBy: autor, archivedAt: null, archivedBy: null,
  createdAt: new Date("2026-11-06T00:00:00Z"), updatedAt: new Date("2026-11-06T00:00:00Z"),
};

function setup() {
  const prisma = new PrismaService();
  vi.spyOn(prisma, "$queryRaw").mockResolvedValue([]);
  vi.spyOn(prisma, "comContexto").mockImplementation(async (callback: unknown) => {
    if (typeof callback !== "function") throw new Error("Callback de contexto esperado.");
    return callback(prisma);
  });
  const storage = new ArmazenamentoDeDocumentos(new ConfigService());
  vi.spyOn(acesso, "lerAcessoComercial").mockResolvedValue({ podeOperar: true, admin: false, gestorEm: [] });
  vi.spyOn(prisma.deal, "findUnique").mockResolvedValue({ pipelineId: "pipeline", ownerId: autor.id } as never);
  vi.spyOn(prisma.pipeline, "findUnique").mockResolvedValue({ id: "pipeline", companyId: "plugga" } as never);
  const list = vi.spyOn(prisma.leadDocument, "findMany").mockImplementation((args) => Promise.resolve(args?.where?.uploadState === "cleanup" ? [] : [documento]) as never);
  vi.spyOn(prisma.leadDocument, "updateMany").mockResolvedValue({ count: 0 });
  const read = vi.spyOn(prisma.leadDocument, "findFirst").mockResolvedValue(documento as never);
  const detail = vi.spyOn(prisma.leadDocument, "findUniqueOrThrow").mockResolvedValue(documento as never);
  const write = vi.spyOn(prisma.leadDocument, "update").mockResolvedValue(documento as never);
  const create = vi.spyOn(prisma.leadDocument, "create").mockResolvedValue({ id: documento.id } as never);
  vi.spyOn(prisma.dealHistory, "create").mockResolvedValue({} as never);
  vi.spyOn(prisma.eventLog, "createMany").mockResolvedValue({ count: 1 });
  const destroy = vi.fn();
  const storageRead = vi.spyOn(storage, "ler").mockResolvedValue({ objeto: { corpo: Readable.from("sintético") }, cliente: { destroy } } as never);
  const upload = vi.spyOn(storage, "enviar").mockResolvedValue(undefined);
  vi.spyOn(storage, "balde").mockReturnValue("sintetico");
  return { prisma, repo: new PrismaLeadDocumentosRepository(prisma, new AuditAppender(), storage), list, read, detail, write, create, storageRead, upload, destroy };
}

afterEach(() => vi.restoreAllMocks());

describe("Documentos: acesso pela tela e vínculo ao negócio pai", () => {
  it("membro lista e edita documento de outro responsável na tela, preservando a autoria", async () => {
    const { repo, list, read, write } = setup();
    const resultado = await repo.list(dealId, principal);
    expect(resultado.documents[0]?.uploadedBy).toEqual(autor);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ where: { dealId, uploadState: "ready" } }));
    await expect(repo.update(dealId, documento.id, { category: "procuracao_contrato" }, principal)).resolves.toMatchObject({ id: documento.id, uploadedBy: autor });
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ where: { id: documento.id, dealId } }));
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ where: { id: documento.id }, data: { category: "procuracao_contrato" } }));
  });

  it("membro envia arquivo ao lead de outro responsável usando a própria identidade", async () => {
    const { repo, detail, create, upload } = setup();
    const propriaAutoria = { id: principal.id, name: "Membro atual" };
    detail.mockResolvedValue({ ...documento, uploadedById: principal.id, uploadedBy: propriaAutoria } as never);
    await expect(repo.upload(dealId, "outros", { originalName: "arquivo.pdf", buffer: Buffer.from("%PDF-1.4\n% sintético\n%%EOF") }, principal)).resolves.toMatchObject({ uploadedBy: propriaAutoria });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ dealId, uploadedById: principal.id }) }));
    expect(upload).toHaveBeenCalledOnce();
  });

  it.each(["download", "preview"] as const)("%s aceita arquivo do negócio compartilhado e preserva autoria mínima", async (operacao) => {
    const { repo, read, storageRead, destroy } = setup();
    const resultado = await repo[operacao](dealId, documento.id, principal);
    expect(resultado.documento.uploadedBy).toEqual(autor);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ where: { id: documento.id, dealId, uploadState: "ready" } }));
    expect(storageRead).toHaveBeenCalledWith(documento.storageKey);
    resultado.encerrar();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it.each(["update", "archive", "download", "preview"] as const)("%s recusa ID de arquivo que não pertence ao negócio do caminho", async (operacao) => {
    const { repo, read, write, storageRead, upload } = setup();
    read.mockResolvedValue(null);
    const trabalho = operacao === "update" ? repo.update(dealId, documento.id, { category: "outros" }, principal) : repo[operacao](dealId, documento.id, principal);
    await expect(trabalho).rejects.toBeInstanceOf(NaoEncontrado);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: documento.id, dealId }) }));
    expect(write).not.toHaveBeenCalled();
    expect(storageRead).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("tela revogada recusa todos os caminhos antes de acessar conteúdo e storage", async () => {
    const { repo, list, read, create, write, storageRead, upload } = setup();
    vi.mocked(acesso.lerAcessoComercial).mockResolvedValue({ podeOperar: false, admin: false, gestorEm: [] });
    const operacoes = [
      () => repo.list(dealId, principal),
      () => repo.upload(dealId, "outros", { originalName: "arquivo.pdf", buffer: Buffer.from("sintético") }, principal),
      () => repo.update(dealId, documento.id, { category: "outros" }, principal),
      () => repo.archive(dealId, documento.id, principal),
      () => repo.download(dealId, documento.id, principal),
      () => repo.preview(dealId, documento.id, principal),
    ];
    for (const operacao of operacoes) await expect(operacao()).rejects.toBeInstanceOf(NaoEncontrado);
    for (const chamada of [list, read, create, write, storageRead, upload]) expect(chamada).not.toHaveBeenCalled();
  });
});
