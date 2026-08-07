import { z } from "zod";

import { clientSegmentSchema } from "./clients.js";

const uuid = z.string().uuid();
const isoDate = z.string().datetime();
const decimalString = z.string().regex(/^\d+(\.\d{1,2})?$/, "valor deve ser um decimal com até 2 casas");

export const opportunityStageSchema = z.enum(["leads", "qualificacao", "proposta", "decisao"]);
export type OpportunityStage = z.infer<typeof opportunityStageSchema>;

export const opportunityStatusSchema = z.enum(["aberta", "ganha", "perdida", "revisitar"]);
export type OpportunityStatus = z.infer<typeof opportunityStatusSchema>;

export const contractStatusSchema = z.enum([
  "rascunho",
  "revisao_interna",
  "aguardando_assinatura",
  "ativo",
  "vencendo",
  "encerrado",
]);
export type ContractStatus = z.infer<typeof contractStatusSchema>;

/** Forward-only sequence a contract's status must follow (ADR-less rule, see prisma-commercial.repository.ts). */
export const CONTRACT_STATUS_SEQUENCE: readonly ContractStatus[] = [
  "rascunho",
  "revisao_interna",
  "aguardando_assinatura",
  "ativo",
  "vencendo",
  "encerrado",
];

export const opportunityContactChannelSchema = z.enum(["phone", "whatsapp", "email", "presencial", "outro"]);
export const opportunityContactOutcomeSchema = z.enum([
  "attempted",
  "connected",
  "proposal_sent",
  "no_answer",
  "declined",
  "scheduled",
]);

export const opportunityContactSchema = z.object({
  id: uuid,
  opportunityId: uuid,
  channel: opportunityContactChannelSchema,
  outcome: opportunityContactOutcomeSchema,
  note: z.string().nullable(),
  createdAt: isoDate,
});
export type OpportunityContact = z.infer<typeof opportunityContactSchema>;

export const opportunityContactRequestSchema = z
  .object({
    channel: opportunityContactChannelSchema,
    outcome: opportunityContactOutcomeSchema,
    note: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();
export type OpportunityContactRequest = z.infer<typeof opportunityContactRequestSchema>;

export const opportunitySummarySchema = z.object({
  id: uuid,
  title: z.string(),
  product: z.string(),
  stage: opportunityStageSchema,
  status: opportunityStatusSchema,
  ownerId: uuid.nullable(),
  ownerName: z.string().nullable(),
  clientId: uuid.nullable(),
  clientName: z.string().nullable(),
  estimatedValue: decimalString.nullable(),
  nextActionAt: isoDate.nullable(),
  nextActionNote: z.string().nullable(),
  lossReason: z.string().nullable(),
  decidedAt: isoDate.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type OpportunitySummary = z.infer<typeof opportunitySummarySchema>;

export const opportunityListSchema = z.object({ items: z.array(opportunitySummarySchema) });
export type OpportunityList = z.infer<typeof opportunityListSchema>;

export const opportunityDetailSchema = opportunitySummarySchema.extend({
  contacts: z.array(opportunityContactSchema),
  contracts: z.array(z.object({ id: uuid, status: contractStatusSchema, createdAt: isoDate })),
});
export type OpportunityDetail = z.infer<typeof opportunityDetailSchema>;

export const opportunityListQuerySchema = z
  .object({
    stage: opportunityStageSchema.optional(),
    status: opportunityStatusSchema.optional(),
    ownerId: uuid.optional(),
  })
  .strict();
export type OpportunityListQuery = z.infer<typeof opportunityListQuerySchema>;

/**
 * ownerId/nextActionAt are required at creation, not merely on later
 * transitions: an opportunity is created directly into status "aberta", and
 * the blocking rule ("nenhuma oportunidade ativa fica sem responsável e
 * próxima ação") has to hold from the first moment it exists, not just be
 * checked later. Making the fields required here is what makes that
 * invariant unconditionally true instead of racy.
 */
export const createOpportunityRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    product: z.string().trim().min(1).max(120),
    clientId: uuid.optional(),
    ownerId: uuid,
    estimatedValue: decimalString.optional(),
    nextActionAt: isoDate,
    nextActionNote: z.string().trim().max(500).optional(),
  })
  .strict();
export type CreateOpportunityRequest = z.infer<typeof createOpportunityRequestSchema>;

/** ownerId/nextActionAt are optional here: omitting them means "leave the current value", never "clear it" — there is no way to null them out while the opportunity stays open. */
export const updateOpportunityStageRequestSchema = z
  .object({
    stage: opportunityStageSchema,
    ownerId: uuid.optional(),
    nextActionAt: isoDate.optional(),
    nextActionNote: z.string().trim().max(500).optional(),
  })
  .strict();
export type UpdateOpportunityStageRequest = z.infer<typeof updateOpportunityStageRequestSchema>;

export const newClientForOpportunitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(200).optional(),
  segment: clientSegmentSchema.optional(),
});
export type NewClientForOpportunity = z.infer<typeof newClientForOpportunitySchema>;

export const winOpportunityRequestSchema = z
  .object({
    clientId: uuid.optional(),
    newClient: newClientForOpportunitySchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.clientId && !value.newClient) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "marcar como ganha exige um cliente vinculado ou um novo cliente",
      });
    }
    if (value.clientId && value.newClient) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "informe apenas um cliente vinculado ou um novo cliente, não os dois",
      });
    }
  });
export type WinOpportunityRequest = z.infer<typeof winOpportunityRequestSchema>;

export const loseOpportunityRequestSchema = z
  .object({ lossReason: z.string().trim().min(1).max(500) })
  .strict();
export type LoseOpportunityRequest = z.infer<typeof loseOpportunityRequestSchema>;

export const revisitOpportunityRequestSchema = z
  .object({
    nextActionAt: isoDate,
    nextActionNote: z.string().trim().min(1).max(500),
    ownerId: uuid.optional(),
  })
  .strict();
export type RevisitOpportunityRequest = z.infer<typeof revisitOpportunityRequestSchema>;

// --- Contracts ---------------------------------------------------------

export const contractSummarySchema = z.object({
  id: uuid,
  status: contractStatusSchema,
  clientId: uuid,
  clientName: z.string(),
  opportunityId: uuid.nullable(),
  ownerId: uuid.nullable(),
  ownerName: z.string().nullable(),
  startsAt: isoDate.nullable(),
  endsAt: isoDate.nullable(),
  signedAt: isoDate.nullable(),
  nextActionAt: isoDate.nullable(),
  nextActionNote: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type ContractSummary = z.infer<typeof contractSummarySchema>;

export const contractListSchema = z.object({ items: z.array(contractSummarySchema) });
export type ContractList = z.infer<typeof contractListSchema>;

export const contractDetailSchema = contractSummarySchema;
export type ContractDetail = z.infer<typeof contractDetailSchema>;

export const contractListQuerySchema = z
  .object({
    status: contractStatusSchema.optional(),
    clientId: uuid.optional(),
    ownerId: uuid.optional(),
  })
  .strict();
export type ContractListQuery = z.infer<typeof contractListQuerySchema>;

/** A contract is born from a won opportunity or opened directly on an existing client — never both, never neither. */
export const createContractRequestSchema = z
  .object({
    opportunityId: uuid.optional(),
    clientId: uuid.optional(),
    ownerId: uuid.optional(),
    startsAt: isoDate.optional(),
    endsAt: isoDate.optional(),
    nextActionAt: isoDate.optional(),
    nextActionNote: z.string().trim().max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.opportunityId && !value.clientId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "um contrato precisa nascer de uma oportunidade ganha ou de um cliente existente",
      });
    }
    if (value.opportunityId && value.clientId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "informe apenas a oportunidade de origem ou o cliente, não os dois",
      });
    }
  });
export type CreateContractRequest = z.infer<typeof createContractRequestSchema>;

export const updateContractStatusRequestSchema = z
  .object({
    status: contractStatusSchema,
    ownerId: uuid.optional(),
    nextActionAt: isoDate.optional(),
    nextActionNote: z.string().trim().max(500).optional(),
    signedAt: isoDate.optional(),
    startsAt: isoDate.optional(),
    endsAt: isoDate.optional(),
  })
  .strict();
export type UpdateContractStatusRequest = z.infer<typeof updateContractStatusRequestSchema>;
