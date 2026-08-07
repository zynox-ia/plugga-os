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

const uuid = z.string().uuid();
const isoDate = z.string().datetime();
export const evSegmentSchema = z.enum(["r0", "r1", "r2", "r3", "r4", "r5", "r6"]);

export const reactivationQueueItemSchema = z.object({
  id: uuid,
  displayName: z.string(),
  phoneMasked: z.string().nullable(),
  segment: evSegmentSchema,
  lastSessionAt: isoDate.nullable(),
  nextActionAt: isoDate.nullable(),
  walletBalance: z.string().nullable(),
});
export const reactivationQueueSchema = z.object({ mode: pluggamobModeSchema, items: z.array(reactivationQueueItemSchema) });
export type ReactivationQueue = z.infer<typeof reactivationQueueSchema>;

export const evContactRequestSchema = z.object({
  channel: z.enum(["phone", "whatsapp", "email", "manual"]),
  outcome: z.enum(["attempted", "connected", "converted", "no_answer", "declined"]),
  nextActionAt: isoDate.optional(),
  sessionId: uuid.optional(),
}).strict().superRefine((value, context) => {
  if (value.outcome === "converted" && !value.sessionId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["sessionId"], message: "a conversion requires a linked session" });
  }
});
export type EvContactRequest = z.infer<typeof evContactRequestSchema>;

export const evOptOutRequestSchema = z.object({ reason: z.string().trim().min(1).max(300).optional() }).strict();
export type EvOptOutRequest = z.infer<typeof evOptOutRequestSchema>;

export const evUserProfileSchema = z.object({
  mode: pluggamobModeSchema,
  id: uuid,
  displayName: z.string(),
  phoneMasked: z.string().nullable(),
  segment: evSegmentSchema,
  optedOutAt: isoDate.nullable(),
  walletBalance: z.string().nullable(),
  segmentHistory: z.array(z.object({ segment: evSegmentSchema, changedAt: isoDate })),
  contacts: z.array(z.object({ id: uuid, channel: z.string(), outcome: z.string(), nextActionAt: isoDate.nullable(), sessionId: uuid.nullable(), createdAt: isoDate })),
  sessions: z.array(z.object({ id: uuid, externalId: z.string(), status: z.string(), startedAt: isoDate, locationName: z.string(), amount: z.string().nullable() })),
  locations: z.array(z.string()),
  coupons: z.array(z.object({ id: uuid, code: z.string(), status: z.string(), createdAt: isoDate })),
  openIncidents: z.array(z.object({ id: uuid, kind: z.string(), severity: z.string(), summary: z.string(), status: z.string() })),
});
export type EvUserProfile = z.infer<typeof evUserProfileSchema>;

export const pluggamobSessionSchema = z.object({ id: uuid, externalId: z.string(), status: z.enum(["active", "completed", "failed", "blocked"]), startedAt: isoDate, endedAt: isoDate.nullable(), kwh: z.string().nullable(), amount: z.string().nullable(), userName: z.string(), locationName: z.string(), connectorLabel: z.string().nullable(), incidentCount: z.number().int().nonnegative() });
export const pluggamobSessionsSchema = z.object({ mode: pluggamobModeSchema, items: z.array(pluggamobSessionSchema) });
export type PluggamobSessions = z.infer<typeof pluggamobSessionsSchema>;
export const pluggamobLocationSchema = z.object({ id: uuid, partnerName: z.string(), name: z.string(), status: z.enum(["active", "inactive", "unknown"]), timezone: z.string(), stations: z.array(z.object({ id: uuid, name: z.string(), connectors: z.array(z.object({ id: uuid, label: z.string(), status: z.string() })) })), openIncidents: z.number().int().nonnegative() });
export const pluggamobLocationsSchema = z.object({ mode: pluggamobModeSchema, items: z.array(pluggamobLocationSchema) });
export type PluggamobLocations = z.infer<typeof pluggamobLocationsSchema>;
export const incidentRequestSchema = z.object({ kind: z.string().trim().min(1).max(80), severity: z.enum(["low", "medium", "high", "critical"]), summary: z.string().trim().min(1).max(500), owner: z.string().trim().min(1).max(150), userId: uuid.optional(), sessionId: uuid.optional(), locationId: uuid.optional(), settlementId: uuid.optional() }).strict().superRefine((value, context) => { if (![value.userId, value.sessionId, value.locationId, value.settlementId].some(Boolean)) context.addIssue({ code: z.ZodIssueCode.custom, message: "an incident requires an origin" }); });
export type IncidentRequest = z.infer<typeof incidentRequestSchema>;
export const incidentResponseSchema = z.object({ id: uuid, status: z.enum(["open", "investigating", "resolved", "blocked"]), kind: z.string(), severity: z.string(), summary: z.string(), owner: z.string().nullable() });
export type IncidentResponse = z.infer<typeof incidentResponseSchema>;

export const settlementStatusSchema = z.enum(["draft", "auditing", "ready_for_review", "approved", "exported", "blocked"]);
export const settlementSummarySchema = z.object({ id: uuid, partnerName: z.string(), weekStart: isoDate, weekEnd: isoDate, status: settlementStatusSchema, totalAmount: z.string(), blockerCount: z.number().int().nonnegative() });
export const settlementsSchema = z.object({ mode: pluggamobModeSchema, items: z.array(settlementSummarySchema) });
export type Settlements = z.infer<typeof settlementsSchema>;
export const settlementDetailSchema = settlementSummarySchema.extend({ canClose: z.boolean(), blockers: z.array(z.object({ id: uuid, reason: z.string(), classification: z.string(), amount: z.string().nullable() })), lines: z.array(z.object({ id: uuid, tokenRfid: z.string().nullable(), classification: z.string(), amount: z.string().nullable(), blockedReason: z.string().nullable() })), credits: z.array(z.object({ id: uuid, amount: z.string(), status: z.string(), availableAt: isoDate })) });
export type SettlementDetail = z.infer<typeof settlementDetailSchema>;
export const resolveBlockerRequestSchema = z.object({ note: z.string().trim().min(1).max(500) }).strict();
export type ResolveBlockerRequest = z.infer<typeof resolveBlockerRequestSchema>;
