import { z } from "zod";

export const pluggamobModeSchema = z.literal("mock");

export const pluggamobOverviewSchema = z.object({
  mode: pluggamobModeSchema,
  sessionsToday: z.number().int().nonnegative(),
  activeSessions: z.number().int().nonnegative(),
  openIncidents: z.number().int().nonnegative(),
  pendingSettlements: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});

export type PluggamobOverview = z.infer<typeof pluggamobOverviewSchema>;

export const settlementStatusSchema = z.enum([
  "draft",
  "auditing",
  "ready_for_review",
  "approved",
  "exported",
  "blocked",
]);

const moneySchema = z.string().regex(/^\d+\.\d{2}$/);

export const couponSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().trim().min(1),
    status: z.string().trim().min(1),
    createdAt: z.string().datetime(),
  })
  .strict();

export const couponsResponseSchema = z
  .object({ mode: pluggamobModeSchema, items: z.array(couponSchema) })
  .strict();

export const settlementBlockerSchema = z
  .object({
    lineId: z.string().uuid(),
    reason: z.string().trim().min(1),
    assignee: z.string().trim().min(1),
    evidenceMissing: z.string().trim().min(1),
    nextAction: z.string().trim().min(1),
  })
  .strict();

export const canClosePanelSchema = z
  .object({
    canClose: z.boolean(),
    blockerCount: z.number().int().nonnegative(),
    blockers: z.array(settlementBlockerSchema),
  })
  .strict();

export const settlementSummarySchema = z
  .object({
    id: z.string().uuid(),
    partner: z
      .object({ id: z.string().uuid(), key: z.string().min(1), name: z.string().min(1) })
      .strict(),
    weekStart: z.string().datetime(),
    weekEnd: z.string().datetime(),
    status: settlementStatusSchema,
    lineCount: z.number().int().nonnegative(),
    amount: moneySchema,
    canClose: z.boolean(),
    blockerCount: z.number().int().nonnegative(),
  })
  .strict();

export const settlementsResponseSchema = z
  .object({ mode: pluggamobModeSchema, items: z.array(settlementSummarySchema) })
  .strict();

export const settlementLineSchema = z
  .object({
    id: z.string().uuid(),
    sessionId: z.string().uuid().nullable(),
    tokenRfid: z.string().trim().min(1).nullable(),
    classification: z.string().trim().min(1),
    amount: moneySchema.nullable(),
    blockedReason: z.string().trim().min(1).nullable(),
  })
  .strict();

export const settlementDetailSchema = settlementSummarySchema
  .extend({
    lines: z.array(settlementLineSchema),
    canClosePanel: canClosePanelSchema,
  })
  .strict();

export const d14CreditSchema = z
  .object({
    id: z.string().uuid(),
    settlementId: z.string().uuid(),
    partnerName: z.string().trim().min(1),
    amount: moneySchema,
    status: z.string().trim().min(1),
    availableAt: z.string().datetime(),
  })
  .strict();

export const d14CreditsResponseSchema = z
  .object({ mode: pluggamobModeSchema, items: z.array(d14CreditSchema) })
  .strict();

export const resolveSettlementBlockerRequestSchema = z
  .object({
    lineId: z.string().uuid(),
    resolution: z.string().trim().min(3).max(1_000),
  })
  .strict();

export const settlementDecisionRequestSchema = z
  .object({ note: z.string().trim().min(3).max(1_000).optional() })
  .strict();

export type Coupon = z.infer<typeof couponSchema>;
export type CouponsResponse = z.infer<typeof couponsResponseSchema>;
export type SettlementStatus = z.infer<typeof settlementStatusSchema>;
export type SettlementSummary = z.infer<typeof settlementSummarySchema>;
export type SettlementsResponse = z.infer<typeof settlementsResponseSchema>;
export type SettlementDetail = z.infer<typeof settlementDetailSchema>;
export type D14CreditsResponse = z.infer<typeof d14CreditsResponseSchema>;
export type ResolveSettlementBlockerRequest = z.infer<typeof resolveSettlementBlockerRequestSchema>;
export type SettlementDecisionRequest = z.infer<typeof settlementDecisionRequestSchema>;
