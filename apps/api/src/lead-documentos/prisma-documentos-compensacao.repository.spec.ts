import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditAppender } from "../audit/audit-appender";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { ArmazenamentoDeDocumentos } from "./armazenamento-de-documentos";
import { PrismaLeadDocumentosRepository } from "./prisma-lead-documentos.repository";

const principal: AuthPrincipal = { id: "user", kind: "user", acesso: { plataforma: "admin", departamentos: [] } };

function setup() {
  const prisma = new PrismaService();
  vi.spyOn(prisma, "comContexto").mockImplementation(async (callback: unknown) => {
    if (typeof callback !== "function") throw new Error("Callback de contexto esperado.");
    return callback(prisma);
  });
  const storage = new ArmazenamentoDeDocumentos(new ConfigService());
  const mark = vi.spyOn(prisma.leadDocument, "updateMany").mockResolvedValue({ count: 1 });
  const read = vi.spyOn(prisma.leadDocument, "findMany").mockResolvedValue([{ id: "doc", storageKey: "chave" }] as never);
  const remove = vi.spyOn(prisma.leadDocument, "deleteMany").mockResolvedValue({ count: 1 });
  const exclude = vi.spyOn(storage, "excluir").mockResolvedValue(undefined);
  return { repo: new PrismaLeadDocumentosRepository(prisma, new AuditAppender(), storage), mark, read, remove, exclude };
}
afterEach(() => vi.restoreAllMocks());

describe("Compensação do PDF da proposta", () => {
  it("oculta só upload próprio sem versão e remove arquivo antes da metadata", async () => {
    const { repo, mark, remove, exclude } = setup();
    await repo.discardProposalUpload("deal", "doc", principal);
    expect(mark).toHaveBeenCalledWith({
      where: { id: "doc", dealId: "deal", uploadedById: "user", category: "proposta", proposalVersions: { none: {} } }, data: { uploadState: "cleanup" },
    });
    expect(exclude).toHaveBeenCalledWith("chave");
    expect(remove).toHaveBeenCalledWith({ where: { id: "doc", uploadState: "cleanup" } });
    expect(exclude.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]!);
  });
  it("preserva documento já versionado ou de outra pessoa", async () => {
    const { repo, mark, read, remove, exclude } = setup();
    mark.mockResolvedValue({ count: 0 });
    await repo.discardProposalUpload("deal", "doc", principal);
    expect(read).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(exclude).not.toHaveBeenCalled();
  });
  it("storage indisponível mantém cleanup para repetir sem bloquear hash nem anunciar sucesso", async () => {
    const { repo, mark, remove, exclude } = setup();
    exclude.mockRejectedValueOnce(new Error("storage fora"));
    await repo.discardProposalUpload("deal", "doc", principal);
    expect(mark).toHaveBeenCalledWith(expect.objectContaining({ data: { uploadState: "cleanup" } }));
    expect(remove).not.toHaveBeenCalled();
    await repo.discardProposalUpload("deal", "doc", principal);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
