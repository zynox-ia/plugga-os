import { z } from "zod";

import { leadDocumentSchema } from "./lead-documents.js";
import { isoDate, uuid } from "./primitivas.js";

const shortText = z.string().trim().max(300);
const bodyText = z.string().trim().max(6000);
const civilDate = z.iso.date();

/** Campos opcionais usam string vazia para permitir limpeza explícita. */
export const leadProposalContentSchema = z.object({
  title: shortText.min(1),
  recipient: shortText.min(1),
  company: shortText,
  email: z.union([z.literal(""), z.email().max(300)]),
  phone: shortText,
  city: shortText,
  owner: shortText,
  jobTitle: shortText,
  amount: z.string().regex(/^(?:|\d{1,12}(?:\.\d{1,2})?)$/, "Informe um valor em reais válido."),
  validUntil: civilDate,
  introduction: bodyText,
  scope: bodyText,
  payment: bodyText,
  notes: bodyText,
}).strict();
export type LeadProposalContent = z.infer<typeof leadProposalContentSchema>;

export const leadProposalTemplateStyleSchema = z.enum(["essencial", "consultiva"]);
export type LeadProposalTemplateStyle = z.infer<typeof leadProposalTemplateStyleSchema>;
export const leadProposalTemplateSchema = z.object({
  id: uuid,
  name: z.string(),
  description: z.string(),
  style: leadProposalTemplateStyleSchema,
  defaults: leadProposalContentSchema,
});
export type LeadProposalTemplate = z.infer<typeof leadProposalTemplateSchema>;

export const leadProposalSchema = z.object({
  id: uuid,
  dealId: uuid,
  number: z.number().int().positive(),
  templateId: uuid,
  templateName: z.string(),
  templateStyle: leadProposalTemplateStyleSchema,
  status: z.enum(["draft", "generated"]),
  version: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  content: leadProposalContentSchema,
  document: leadDocumentSchema.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type LeadProposal = z.infer<typeof leadProposalSchema>;

export const createLeadProposalRequestSchema = z.object({ templateId: uuid, content: leadProposalContentSchema }).strict();
export type CreateLeadProposalRequest = z.infer<typeof createLeadProposalRequestSchema>;
export const updateLeadProposalRequestSchema = createLeadProposalRequestSchema.extend({ revision: z.number().int().positive() }).strict();
export type UpdateLeadProposalRequest = z.infer<typeof updateLeadProposalRequestSchema>;
export const generateLeadProposalRequestSchema = z.object({ revision: z.number().int().positive() }).strict();
export type GenerateLeadProposalRequest = z.infer<typeof generateLeadProposalRequestSchema>;
export const listLeadProposalsResponseSchema = z.object({ proposals: z.array(leadProposalSchema) });
export type ListLeadProposalsResponse = z.infer<typeof listLeadProposalsResponseSchema>;
export const listLeadProposalTemplatesResponseSchema = z.object({ templates: z.array(leadProposalTemplateSchema) });
export type ListLeadProposalTemplatesResponse = z.infer<typeof listLeadProposalTemplatesResponseSchema>;
export const leadProposalResponseSchema = z.object({ proposal: leadProposalSchema });
export type LeadProposalResponse = z.infer<typeof leadProposalResponseSchema>;
