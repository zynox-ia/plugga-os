import { Readable } from "node:stream";

import { Inject, Injectable, Logger } from "@nestjs/common";
import type { CreateLeadProposalRequest, GenerateLeadProposalRequest, LeadDocument, LeadProposalResponse, UpdateLeadProposalRequest } from "@plugga/shared";

import { EstadoInvalido, RequisicaoInvalida } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { LeadDocumentosService } from "../lead-documentos/lead-documentos.service";
import { LeadPropostasPdf } from "./lead-propostas.pdf";
import { LeadPropostasRepository } from "./lead-propostas.repository";

@Injectable()
export class LeadPropostasService {
  private readonly logger = new Logger(LeadPropostasService.name);
  constructor(
    @Inject(LeadPropostasRepository) private readonly repository: LeadPropostasRepository,
    @Inject(LeadDocumentosService) private readonly documents: LeadDocumentosService,
    @Inject(LeadPropostasPdf) private readonly pdf: LeadPropostasPdf,
  ) {}

  list(dealId: string, principal: AuthPrincipal) { return this.repository.list(dealId, principal); }
  templates(dealId: string, principal: AuthPrincipal) { return this.repository.templates(dealId, principal); }

  async create(dealId: string, input: CreateLeadProposalRequest, principal: AuthPrincipal): Promise<LeadProposalResponse> {
    return { proposal: await this.repository.create(dealId, input, principal) };
  }

  async update(dealId: string, id: string, input: UpdateLeadProposalRequest, principal: AuthPrincipal): Promise<LeadProposalResponse> {
    return { proposal: await this.repository.update(dealId, id, input, principal) };
  }

  async generate(dealId: string, id: string, input: GenerateLeadProposalRequest, principal: AuthPrincipal): Promise<LeadProposalResponse> {
    const generation = await this.repository.beginGeneration(dealId, id, input.revision, principal);
    let uploaded: LeadDocument | undefined;
    try {
      const { proposal } = generation;
      if (!proposal.content.amount) throw new RequisicaoInvalida("Informe o investimento antes de gerar a proposta.");
      const buffer = await this.pdf.render(proposal, false);
      const originalName = `PC-${String(proposal.number).padStart(4, "0")}-v${proposal.version + 1}.pdf`;
      const document = await this.documents.upload(dealId, "proposta", { buffer, originalName }, principal);
      uploaded = document;
      return { proposal: await this.repository.completeGeneration(dealId, generation, document, principal) };
    } catch (error) {
      if (uploaded) {
        try { await this.documents.discardProposalUpload(dealId, uploaded.id, principal); }
        catch { this.logger.warn("Compensação de proposta pendente de limpeza de documento."); }
      }
      try { await this.repository.releaseGeneration(id, generation.token); }
      catch { this.logger.warn("Reserva de geração será liberada pelo prazo de recuperação."); }
      throw error;
    }
  }

  async file(dealId: string, id: string, principal: AuthPrincipal, disposition: "inline" | "attachment") {
    const proposal = await this.repository.get(dealId, id, principal);
    if (proposal.status === "generated") {
      if (!proposal.document) throw new EstadoInvalido("O arquivo desta proposta não está disponível.");
      const file = disposition === "inline"
        ? await this.documents.preview(dealId, proposal.document.id, principal)
        : await this.documents.download(dealId, proposal.document.id, principal);
      return { name: file.documento.originalName, stream: file.stream, encerrar: file.encerrar };
    }
    const buffer = await this.pdf.render(proposal, true);
    const current = await this.repository.get(dealId, id, principal);
    if (current.revision !== proposal.revision) throw new EstadoInvalido("A proposta mudou. Atualize a pré-visualização.");
    return { name: `PC-${String(proposal.number).padStart(4, "0")}-rascunho.pdf`, stream: Readable.from([buffer]), encerrar: () => {} };
  }
}
