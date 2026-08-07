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
