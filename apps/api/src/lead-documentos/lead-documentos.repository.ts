import type { Readable } from "node:stream";

import type { LeadDocument, LeadDocumentCategory, ListLeadDocumentsResponse, UpdateLeadDocumentRequest } from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";

export type ArquivoEnviado = { buffer: Buffer; originalName: string };

export type DownloadDeDocumento = {
  documento: LeadDocument;
  stream: Readable;
  encerrar: () => void;
};

export abstract class LeadDocumentosRepository {
  abstract list(dealId: string, principal: AuthPrincipal): Promise<ListLeadDocumentsResponse>;
  abstract upload(dealId: string, categoria: LeadDocumentCategory, arquivo: ArquivoEnviado, principal: AuthPrincipal): Promise<LeadDocument>;
  abstract update(dealId: string, documentId: string, input: UpdateLeadDocumentRequest, principal: AuthPrincipal): Promise<LeadDocument>;
  abstract archive(dealId: string, documentId: string, principal: AuthPrincipal): Promise<LeadDocument>;
  abstract download(dealId: string, documentId: string, principal: AuthPrincipal): Promise<DownloadDeDocumento>;
  abstract preview(dealId: string, documentId: string, principal: AuthPrincipal): Promise<DownloadDeDocumento>;
}
