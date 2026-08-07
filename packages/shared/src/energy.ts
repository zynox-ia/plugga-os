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

// Ticket 3 (cycles): request/detail/report schemas for the Cycle flow.
// Reuses the enums and cycleSummarySchema declared above without redefining
// them.

export const cycleAuditRefSchema = z.object({
  id: uuid,
  type: auditTypeSchema,
  status: auditStatusSchema,
  divergenceBlocksClosing: z.boolean(),
  summary: z.string().nullable(),
});
export type CycleAuditRef = z.infer<typeof cycleAuditRefSchema>;

export const cycleDetailSchema = cycleSummarySchema.extend({
  reportApprovedById: uuid.nullable(),
  reportFileId: z.string().nullable(),
  audits: z.array(cycleAuditRefSchema),
  closeBlockers: z.array(z.string()),
});
export type CycleDetail = z.infer<typeof cycleDetailSchema>;

export const cycleListQuerySchema = z.object({
  clientId: uuid.optional(),
  consumerUnitId: uuid.optional(),
  status: cycleStatusSchema.optional(),
  competenceMonth: z.coerce.number().int().min(1).max(12).optional(),
  competenceYear: z.coerce.number().int().min(2000).optional(),
});
export type CycleListQuery = z.infer<typeof cycleListQuerySchema>;

export const createCycleRequestSchema = z.object({
  clientId: uuid,
  consumerUnitId: uuid,
  competenceMonth: z.number().int().min(1).max(12),
  competenceYear: z.number().int().min(2000),
  ownerId: uuid,
  nextActionAt: isoDate,
  nextActionNote: z.string().max(500).optional(),
});
export type CreateCycleRequest = z.infer<typeof createCycleRequestSchema>;

export const markCycleDocumentsReceivedRequestSchema = z.object({
  nextActionAt: isoDate.optional(),
  nextActionNote: z.string().max(500).optional(),
});
export type MarkCycleDocumentsReceivedRequest = z.infer<typeof markCycleDocumentsReceivedRequestSchema>;

export const generateCycleReportRequestSchema = z.object({
  estimatedSavings: decimalString.optional(),
  nextActionAt: isoDate.optional(),
  nextActionNote: z.string().max(500).optional(),
});
export type GenerateCycleReportRequest = z.infer<typeof generateCycleReportRequestSchema>;

export const approveCycleReportRequestSchema = z.object({
  nextActionAt: isoDate.optional(),
  nextActionNote: z.string().max(500).optional(),
});
export type ApproveCycleReportRequest = z.infer<typeof approveCycleReportRequestSchema>;

export const sendCycleReportRequestSchema = z.object({
  realizedSavings: decimalString.optional(),
});
export type SendCycleReportRequest = z.infer<typeof sendCycleReportRequestSchema>;

export const closeCycleRequestSchema = z.object({});
export type CloseCycleRequest = z.infer<typeof closeCycleRequestSchema>;

export const cycleReportsQuerySchema = z.object({
  clientId: uuid.optional(),
  consumerUnitId: uuid.optional(),
  competenceMonth: z.coerce.number().int().min(1).max(12).optional(),
  competenceYear: z.coerce.number().int().min(2000).optional(),
});
export type CycleReportsQuery = z.infer<typeof cycleReportsQuerySchema>;

export const cycleReportsResponseSchema = z.object({
  items: z.array(cycleSummarySchema),
  totals: z.object({
    count: z.number().int().min(0),
    estimatedSavings: decimalString,
    realizedSavings: decimalString,
  }),
});
export type CycleReportsResponse = z.infer<typeof cycleReportsResponseSchema>;
