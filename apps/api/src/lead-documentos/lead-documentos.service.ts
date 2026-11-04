import { Inject, Injectable } from "@nestjs/common";
import type { LeadDocument, ListLeadDocumentsResponse, UpdateLeadDocumentRequest, LeadDocumentCategory } from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import type { ArquivoEnviado, DownloadDeDocumento } from "./lead-documentos.repository";
import { LeadDocumentosRepository } from "./lead-documentos.repository";

@Injectable()
export class LeadDocumentosService {
  constructor(@Inject(LeadDocumentosRepository) private readonly repository: LeadDocumentosRepository) {}

  list(dealId: string, principal: AuthPrincipal): Promise<ListLeadDocumentsResponse> {
    return this.repository.list(dealId, principal);
  }

  upload(dealId: string, categoria: LeadDocumentCategory, arquivo: ArquivoEnviado, principal: AuthPrincipal): Promise<LeadDocument> {
    return this.repository.upload(dealId, categoria, arquivo, principal);
  }

  update(dealId: string, documentId: string, input: UpdateLeadDocumentRequest, principal: AuthPrincipal): Promise<LeadDocument> {
    return this.repository.update(dealId, documentId, input, principal);
  }

  archive(dealId: string, documentId: string, principal: AuthPrincipal): Promise<LeadDocument> {
    return this.repository.archive(dealId, documentId, principal);
  }

  download(dealId: string, documentId: string, principal: AuthPrincipal): Promise<DownloadDeDocumento> {
    return this.repository.download(dealId, documentId, principal);
  }

  preview(dealId: string, documentId: string, principal: AuthPrincipal): Promise<DownloadDeDocumento> {
    return this.repository.preview(dealId, documentId, principal);
  }

  discardProposalUpload(dealId: string, documentId: string, principal: AuthPrincipal): Promise<void> {
    return this.repository.discardProposalUpload(dealId, documentId, principal);
  }
}
