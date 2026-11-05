import { Readable } from "node:stream";

import type { LeadDocument, LeadProposal } from "@plugga/shared";
import { describe, expect, it, vi } from "vitest";

import { EstadoInvalido, NaoEncontrado, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { LeadDocumentosRepository } from "../lead-documentos/lead-documentos.repository";
import { LeadDocumentosService } from "../lead-documentos/lead-documentos.service";
import { LeadPropostasPdf } from "./lead-propostas.pdf";
import { LeadPropostasRepository } from "./lead-propostas.repository";
import { LeadPropostasService } from "./lead-propostas.service";

const principal: AuthPrincipal = { id: "user", kind: "user", acesso: { plataforma: "admin", departamentos: [] } };
const proposal: LeadProposal = {
  id: "proposal", dealId: "deal", number: 1, templateId: "template", templateName: "Essencial", templateStyle: "essencial",
  status: "draft", version: 0, revision: 1, document: null, createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z",
  content: { title: "Proposta", recipient: "João", company: "", email: "", phone: "", city: "", owner: "", jobTitle: "", amount: "100.00", validUntil: "2026-11-20", introduction: "", scope: "", payment: "", notes: "" },
};
const document: LeadDocument = { id: "doc", dealId: "deal", category: "proposta", originalName: "PC-0001-v1.pdf", detectedMime: "application/pdf", sizeBytes: 100, canPreview: true, uploadedBy: null, archivedBy: null, archivedAt: null, createdAt: proposal.createdAt, updatedAt: proposal.updatedAt };

function setup() {
  const repo = {
    list: vi.fn(), templates: vi.fn(), get: vi.fn().mockResolvedValue(proposal), create: vi.fn(), update: vi.fn(),
    beginGeneration: vi.fn().mockResolvedValue({ proposal, token: "token" }),
    completeGeneration: vi.fn().mockResolvedValue({ ...proposal, version: 1, revision: 2, status: "generated", document }), releaseGeneration: vi.fn().mockResolvedValue(undefined),
  } satisfies LeadPropostasRepository;
  const docsRepo = { list: vi.fn(), upload: vi.fn().mockResolvedValue(document), update: vi.fn(), archive: vi.fn(), download: vi.fn(), preview: vi.fn(), discardProposalUpload: vi.fn().mockResolvedValue(undefined) } satisfies LeadDocumentosRepository;
  const pdf = new LeadPropostasPdf();
  const render = vi.spyOn(pdf, "render").mockResolvedValue(Buffer.from("%PDF-test"));
  return { repo, docsRepo, render, service: new LeadPropostasService(repo, new LeadDocumentosService(docsRepo), pdf) };
}

describe("Propostas: geração e leitura", () => {
  it("só publica sucesso após armazenar o documento real e concluir a versão", async () => {
    const { service, docsRepo, repo } = setup();
    const result = await service.generate("deal", "proposal", { revision: 1 }, principal);
    expect(result.proposal).toMatchObject({ status: "generated", version: 1, revision: 2, document });
    expect(docsRepo.upload).toHaveBeenCalledWith("deal", "proposta", { originalName: "PC-0001-v1.pdf", buffer: expect.any(Buffer) }, principal);
    expect(repo.completeGeneration).toHaveBeenCalledWith("deal", { proposal, token: "token" }, document, principal);
    expect(repo.releaseGeneration).not.toHaveBeenCalled();
  });
  it("não anuncia geração quando o storage falha e libera a tentativa para repetir", async () => {
    const { service, docsRepo, repo } = setup();
    docsRepo.upload.mockRejectedValue(new Error("storage indisponível"));
    await expect(service.generate("deal", "proposal", { revision: 1 }, principal)).rejects.toThrow("storage");
    expect(repo.completeGeneration).not.toHaveBeenCalled();
    expect(repo.releaseGeneration).toHaveBeenCalledWith("proposal", "token");
  });
  it("propaga 404 de acesso revogado ao concluir, sem devolver sucesso", async () => {
    const { service, repo, docsRepo } = setup();
    repo.completeGeneration.mockRejectedValue(new NaoEncontrado("Negócio não encontrado."));
    await expect(service.generate("deal", "proposal", { revision: 1 }, principal)).rejects.toBeInstanceOf(NaoEncontrado);
    expect(docsRepo.discardProposalUpload).toHaveBeenCalledWith("deal", "doc", principal);
    expect(repo.releaseGeneration).toHaveBeenCalled();
  });
  it("compensa upload após conflito e preserva o erro original se limpeza/reserva falharem", async () => {
    const { service, repo, docsRepo } = setup();
    repo.completeGeneration.mockRejectedValue(new EstadoInvalido("Atualize a proposta."));
    docsRepo.discardProposalUpload.mockRejectedValue(new Error("storage fora"));
    repo.releaseGeneration.mockRejectedValue(new Error("banco fora"));
    await expect(service.generate("deal", "proposal", { revision: 1 }, principal)).rejects.toBeInstanceOf(EstadoInvalido);
    expect(docsRepo.discardProposalUpload).toHaveBeenCalledWith("deal", "doc", principal);
  });
  it("conflito na reserva não renderiza nem envia arquivo", async () => {
    const { service, repo, render, docsRepo } = setup();
    repo.beginGeneration.mockRejectedValue(new EstadoInvalido("Atualize a proposta."));
    await expect(service.generate("deal", "proposal", { revision: 1 }, principal)).rejects.toBeInstanceOf(EstadoInvalido);
    expect(render).not.toHaveBeenCalled();
    expect(docsRepo.upload).not.toHaveBeenCalled();
  });
  it("exige investimento na geração final e libera a reserva", async () => {
    const { service, repo, render } = setup();
    repo.beginGeneration.mockResolvedValue({ proposal: { ...proposal, content: { ...proposal.content, amount: "" } }, token: "token" });
    await expect(service.generate("deal", "proposal", { revision: 1 }, principal)).rejects.toBeInstanceOf(RequisicaoInvalida);
    expect(render).not.toHaveBeenCalled();
    expect(repo.releaseGeneration).toHaveBeenCalled();
  });
  it("preview/download de gerada usa os bytes salvos sem renderizar novamente", async () => {
    const { service, repo, render, docsRepo } = setup();
    repo.get.mockResolvedValue({ ...proposal, status: "generated", version: 1, document });
    const arquivo = { documento: document, stream: Readable.from(["salvo"]), encerrar: vi.fn() };
    docsRepo.preview.mockResolvedValue(arquivo);
    docsRepo.download.mockResolvedValue(arquivo);
    expect(await service.file("deal", "proposal", principal, "inline")).toMatchObject({ stream: arquivo.stream });
    expect(await service.file("deal", "proposal", principal, "attachment")).toMatchObject({ stream: arquivo.stream });
    expect(render).not.toHaveBeenCalled();
  });
  it("preview de rascunho é marcado e revalida acesso após renderizar", async () => {
    const { service, repo, render } = setup();
    const result = await service.file("deal", "proposal", principal, "inline");
    expect(result.name).toBe("PC-0001-rascunho.pdf");
    expect(render).toHaveBeenCalledWith(proposal, true);
    expect(repo.get).toHaveBeenCalledTimes(2);
  });
});
