import { z } from "zod";

const uuid = z.string().uuid();
const isoDate = z.string().datetime();
const decimalString = z.string().regex(/^\d+(\.\d{1,2})?$/, "valor deve ser um decimal com até 2 casas");

// Enums (packages/shared/src/energy.ts). Ticket 1 (fundação) owns this file's
// shape; tickets 2-4 extend it with request/detail schemas for their own
// flow, never redefining an enum already declared here.

export const consumerUnitStatusSchema = z.enum(["active", "inactive"]);
export type ConsumerUnitStatus = z.infer<typeof consumerUnitStatusSchema>;

export const marketMigrationStageSchema = z.enum([
  "analise",
  "contratacao",
  "documentacao",
  "denuncia",
  "ativacao",
]);
export type MarketMigrationStage = z.infer<typeof marketMigrationStageSchema>;

export const marketMigrationStatusSchema = z.enum(["em_andamento", "ativa", "cancelada"]);
export type MarketMigrationStatus = z.infer<typeof marketMigrationStatusSchema>;

export const cycleStatusSchema = z.enum([
  "aguardando_documentos",
  "documentos_recebidos",
  "em_auditoria",
  "relatorio_pronto",
  "validado_internamente",
  "enviado",
  "fechado",
]);
export type CycleStatus = z.infer<typeof cycleStatusSchema>;

export const cycleReportStatusSchema = z.enum(["nao_gerado", "gerado", "aprovado", "reenviado_apos_correcao"]);
export type CycleReportStatus = z.infer<typeof cycleReportStatusSchema>;

export const auditOriginSchema = z.enum(["ciclo_mensal", "migracao_ml", "avulsa"]);
export type AuditOrigin = z.infer<typeof auditOriginSchema>;

export const auditTypeSchema = z.enum(["conferencia_fatura", "contestacao", "validacao_migracao", "oportunidade"]);
export type AuditType = z.infer<typeof auditTypeSchema>;

export const auditStatusSchema = z.enum([
  "em_analise",
  "divergencia_encontrada",
  "contestacao_aberta",
  "resolvida",
  "inconclusiva",
  "sem_divergencia",
]);
export type AuditStatus = z.infer<typeof auditStatusSchema>;

export const contestationStatusSchema = z.enum([
  "rascunho",
  "aberta",
  "aguardando_distribuidora",
  "deferida",
  "indeferida",
  "parcialmente_deferida",
  "encerrada",
]);
export type ContestationStatus = z.infer<typeof contestationStatusSchema>;

// Read summaries. Tickets 2-4 add create/transition request schemas next to
// these, and may extend the summary with fields their flow needs.

export const consumerUnitSummarySchema = z.object({
  id: uuid,
  clientId: uuid,
  clientName: z.string(),
  code: z.string(),
  distributor: z.string(),
  address: z.string().nullable(),
  status: consumerUnitStatusSchema,
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type ConsumerUnitSummary = z.infer<typeof consumerUnitSummarySchema>;

export const listConsumerUnitsResponseSchema = z.object({ items: z.array(consumerUnitSummarySchema) });
export type ListConsumerUnitsResponse = z.infer<typeof listConsumerUnitsResponseSchema>;

export const marketMigrationSummarySchema = z.object({
  id: uuid,
  clientId: uuid.nullable(),
  clientName: z.string().nullable(),
  consumerUnitId: uuid,
  consumerUnitCode: z.string(),
  stage: marketMigrationStageSchema,
  status: marketMigrationStatusSchema,
  ownerId: uuid.nullable(),
  ownerName: z.string().nullable(),
  nextActionAt: isoDate.nullable(),
  nextActionNote: z.string().nullable(),
  cancelReason: z.string().nullable(),
  activatedAt: isoDate.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type MarketMigrationSummary = z.infer<typeof marketMigrationSummarySchema>;

export const listMarketMigrationsResponseSchema = z.object({ items: z.array(marketMigrationSummarySchema) });
export type ListMarketMigrationsResponse = z.infer<typeof listMarketMigrationsResponseSchema>;

export const marketMigrationDetailSchema = marketMigrationSummarySchema;
export type MarketMigrationDetail = z.infer<typeof marketMigrationDetailSchema>;

/** Forward-only sequence a migration's stage must follow (mirrors CONTRACT_STATUS_SEQUENCE in commercial.ts). */
export const MARKET_MIGRATION_STAGE_SEQUENCE: readonly MarketMigrationStage[] = [
  "analise",
  "contratacao",
  "documentacao",
  "denuncia",
  "ativacao",
];

/**
 * ownerId/nextActionAt are required at creation, same rationale as
 * createOpportunityRequestSchema in commercial.ts: a migration is created
 * directly into status "em_andamento", and the blocking rule ("nenhuma
 * migração em andamento fica sem responsável e sem próxima ação") has to
 * hold from the first moment it exists.
 */
export const createMarketMigrationRequestSchema = z
  .object({
    consumerUnitId: uuid,
    ownerId: uuid,
    nextActionAt: isoDate,
    nextActionNote: z.string().trim().max(500).optional(),
  })
  .strict();
export type CreateMarketMigrationRequest = z.infer<typeof createMarketMigrationRequestSchema>;

/** ownerId/nextActionAt are optional here: omitting them means "leave the current value", never "clear it". */
export const advanceMarketMigrationStageRequestSchema = z
  .object({
    stage: marketMigrationStageSchema,
    ownerId: uuid.optional(),
    nextActionAt: isoDate.optional(),
    nextActionNote: z.string().trim().max(500).optional(),
  })
  .strict();
export type AdvanceMarketMigrationStageRequest = z.infer<typeof advanceMarketMigrationStageRequestSchema>;

export const cancelMarketMigrationRequestSchema = z
  .object({ cancelReason: z.string().trim().min(1).max(500) })
  .strict();
export type CancelMarketMigrationRequest = z.infer<typeof cancelMarketMigrationRequestSchema>;

export const newClientForMarketMigrationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(200).optional(),
});
export type NewClientForMarketMigration = z.infer<typeof newClientForMarketMigrationSchema>;

/** Activation links or creates a client (dedupe by exact phone/email, same as winOpportunityRequestSchema) — never both, never neither. */
export const activateMarketMigrationRequestSchema = z
  .object({
    clientId: uuid.optional(),
    newClient: newClientForMarketMigrationSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.clientId && !value.newClient) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ativar exige um cliente vinculado ou um novo cliente",
      });
    }
    if (value.clientId && value.newClient) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "informe apenas um cliente vinculado ou um novo cliente, não os dois",
      });
    }
  });
export type ActivateMarketMigrationRequest = z.infer<typeof activateMarketMigrationRequestSchema>;

export const cycleSummarySchema = z.object({
  id: uuid,
  clientId: uuid,
  clientName: z.string(),
  consumerUnitId: uuid,
  consumerUnitCode: z.string(),
  marketMigrationId: uuid.nullable(),
  competenceMonth: z.number().int().min(1).max(12),
  competenceYear: z.number().int().min(2000),
  status: cycleStatusSchema,
  ownerId: uuid.nullable(),
  ownerName: z.string().nullable(),
  nextActionAt: isoDate.nullable(),
  nextActionNote: z.string().nullable(),
  reportStatus: cycleReportStatusSchema,
  reportVersion: z.number().int().min(0),
  reportGeneratedAt: isoDate.nullable(),
  reportApprovedAt: isoDate.nullable(),
  reportSentAt: isoDate.nullable(),
  estimatedSavings: decimalString.nullable(),
  realizedSavings: decimalString.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type CycleSummary = z.infer<typeof cycleSummarySchema>;

export const listCyclesResponseSchema = z.object({ items: z.array(cycleSummarySchema) });
export type ListCyclesResponse = z.infer<typeof listCyclesResponseSchema>;

export const auditSummarySchema = z.object({
  id: uuid,
  origin: auditOriginSchema,
  type: auditTypeSchema,
  status: auditStatusSchema,
  cycleId: uuid.nullable(),
  marketMigrationId: uuid.nullable(),
  summary: z.string().nullable(),
  divergenceBlocksClosing: z.boolean(),
  createdById: uuid.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type AuditSummary = z.infer<typeof auditSummarySchema>;

export const listAuditsResponseSchema = z.object({ items: z.array(auditSummarySchema) });
export type ListAuditsResponse = z.infer<typeof listAuditsResponseSchema>;

export const contestationSummarySchema = z.object({
  id: uuid,
  auditId: uuid,
  distributor: z.string(),
  reason: z.string(),
  estimatedAmount: decimalString.nullable(),
  protocol: z.string().nullable(),
  openedAt: isoDate.nullable(),
  expectedResponseAt: isoDate.nullable(),
  status: contestationStatusSchema,
  ownerId: uuid.nullable(),
  financialResult: decimalString.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type ContestationSummary = z.infer<typeof contestationSummarySchema>;

export const listContestationsResponseSchema = z.object({ items: z.array(contestationSummarySchema) });
export type ListContestationsResponse = z.infer<typeof listContestationsResponseSchema>;
