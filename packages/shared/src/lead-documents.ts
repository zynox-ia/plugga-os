import { z } from "zod";

import { isoDate, uuid } from "./primitivas.js";

/**
 * Documentos do lead (PLU-271, Fatia 2). Um arquivo por requisição; a pessoa
 * categoriza na hora do envio. O arquivo em si nunca aparece no contrato: só
 * os metadados, e o download/preview passam sempre pela API (nunca a URL do
 * objeto no armazenamento).
 */

export const LEAD_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

export const leadDocumentCategories = [
  "proposta",
  "conta_de_energia",
  "documento_do_cliente",
  "procuracao_contrato",
  "outros",
] as const;
export const leadDocumentCategorySchema = z.enum(leadDocumentCategories);
export type LeadDocumentCategory = z.infer<typeof leadDocumentCategorySchema>;

/** Tipos aceitos por conteúdo (assinatura de bytes ou estrutura OOXML mínima). */
export const leadDocumentAcceptedMimes = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;
export type LeadDocumentAcceptedMime = (typeof leadDocumentAcceptedMimes)[number];

/** Tipos que o preview mostra embutido; os demais só baixam. */
export const leadDocumentPreviewableMimes = ["application/pdf", "image/jpeg", "image/png"] as const;

export const uploadLeadDocumentRequestSchema = z.object({ category: leadDocumentCategorySchema }).strict();
export type UploadLeadDocumentRequest = z.infer<typeof uploadLeadDocumentRequestSchema>;

/** Edição parcial: campo ausente mantém o valor atual. */
export const updateLeadDocumentRequestSchema = z
  .object({
    originalName: z.string().trim().min(1, "informe o nome").max(200).optional(),
    category: leadDocumentCategorySchema.optional(),
  })
  .strict();
export type UpdateLeadDocumentRequest = z.infer<typeof updateLeadDocumentRequestSchema>;

const pessoaSchema = z.object({ id: uuid, name: z.string() }).nullable();

export const leadDocumentSchema = z.object({
  id: uuid,
  dealId: uuid,
  category: leadDocumentCategorySchema,
  originalName: z.string(),
  sizeBytes: z.number().int().positive(),
  detectedMime: z.string(),
  canPreview: z.boolean(),
  uploadedBy: pessoaSchema,
  createdAt: isoDate,
  updatedAt: isoDate,
  archivedAt: isoDate.nullable(),
  archivedBy: pessoaSchema,
});
export type LeadDocument = z.infer<typeof leadDocumentSchema>;

export const listLeadDocumentsResponseSchema = z.object({ documents: z.array(leadDocumentSchema) });
export type ListLeadDocumentsResponse = z.infer<typeof listLeadDocumentsResponseSchema>;
