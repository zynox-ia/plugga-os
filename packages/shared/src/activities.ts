import { z } from "zod";
import { isoDate, uuid } from "./primitivas.js";

export const activityTypeSchema = z.enum(["task", "call", "meeting", "visit"]);
export type ActivityType = z.infer<typeof activityTypeSchema>;
export const activityStatusSchema = z.enum(["todo", "doing", "done"]);
export type ActivityStatus = z.infer<typeof activityStatusSchema>;
export const activityPrioritySchema = z.enum(["normal", "medio", "urgente"]);
export const activityTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("deal"), dealId: uuid }).strict(),
  z.object({ kind: z.literal("client"), clientId: uuid }).strict(),
]);
export type ActivityTarget = z.infer<typeof activityTargetSchema>;
export const activityActorSchema = z.object({ type: z.enum(["user", "agent", "system"]), id: uuid.nullable() });
export type ActivityActor = z.infer<typeof activityActorSchema>;

const title = z.string().trim().min(1, "informe o título").max(120);
const notes = z.string().trim().max(2000);
const instant = z.string().datetime({ offset: true }).transform((value) => new Date(value).toISOString());
const schedule = { ownerId: uuid, startsAt: instant, dueAt: instant };
const content = { type: activityTypeSchema, title, notes: notes.default(""), priority: activityPrioritySchema.default("normal") };
const ordered = (value: { startsAt: string; dueAt: string }) => value.dueAt >= value.startsAt;
const orderError = { message: "o fim não pode ser anterior ao início", path: ["dueAt"] };

export const createActivityRequestSchema = z.object({ requestId: uuid, target: activityTargetSchema, ...content, ...schedule }).strict().refine(ordered, orderError);
export type CreateActivityRequest = z.infer<typeof createActivityRequestSchema>;
export const updateActivityRequestSchema = z.object({
  version: z.number().int().positive(), title: title.optional(), notes: notes.optional(), priority: activityPrioritySchema.optional(),
  ownerId: uuid.optional(), startsAt: instant.optional(), dueAt: instant.optional(), status: z.enum(["todo", "doing"]).optional(),
}).strict().refine((value) => Object.entries(value).some(([key, entry]) => key !== "version" && entry !== undefined), "informe uma alteração")
  .refine((value) => !value.startsAt || !value.dueAt || ordered({ startsAt: value.startsAt, dueAt: value.dueAt }), orderError);
export type UpdateActivityRequest = z.infer<typeof updateActivityRequestSchema>;
export const activityOutcomeSchema = z.object({
  summary: z.string().trim().min(1, "registre o resultado da atividade").max(2000),
  documentIds: z.array(uuid).max(50).default([]).refine((ids) => new Set(ids).size === ids.length, "documento repetido"),
}).strict();
export const completeActivityRequestSchema = z.object({
  version: z.number().int().positive(), roundId: uuid, outcome: activityOutcomeSchema,
  nextAction: z.object({ ...content, ...schedule }).strict().refine(ordered, orderError).optional(),
}).strict();
export type CompleteActivityRequest = z.infer<typeof completeActivityRequestSchema>;

export const activityRoundSchema = z.object({
  id: uuid, number: z.number().int().positive(), status: activityStatusSchema, ownerId: uuid,
  startsAt: isoDate, dueAt: isoDate, openedAt: isoDate, openedBy: activityActorSchema,
  endedAt: isoDate.nullable(), endReason: z.enum(["completed", "revised"]).nullable(),
  completedAt: isoDate.nullable(), completedBy: activityActorSchema.nullable(), outcome: activityOutcomeSchema.nullable(), nextActivityId: uuid.nullable(),
});
export type ActivityRound = z.infer<typeof activityRoundSchema>;
export const activitySchema = z.object({
  id: uuid, version: z.number().int().positive(), target: activityTargetSchema, ...content,
  origin: z.enum(["manual", "process", "revisit"]), ruleKey: z.string().nullable(),
  createdAt: isoDate, createdBy: activityActorSchema, currentRound: activityRoundSchema,
});
export type Activity = z.infer<typeof activitySchema>;
export const activityHistoryEntrySchema = z.object({
  id: uuid, kind: z.enum(["created", "updated", "completed", "reopened"]), occurredAt: isoDate, actor: activityActorSchema, snapshot: activitySchema,
});
export type ActivityHistoryEntry = z.infer<typeof activityHistoryEntrySchema>;
export const listActivityHistoryQuerySchema = z.object({ cursor: uuid.optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }).strict();
export type ListActivityHistoryQuery = z.infer<typeof listActivityHistoryQuerySchema>;
export const listActivitiesQuerySchema = z.object({
  scope: z.enum(["mine", "team", "target"]).default("mine"), dealId: uuid.optional(), clientId: uuid.optional(),
  bucket: z.enum(["all", "overdue", "today", "next7", "completed"]).default("all"),
  cursor: uuid.optional(), limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict().refine((value) => !(value.dealId && value.clientId), "escolha um único alvo")
  .refine((value) => value.scope !== "target" || !!(value.dealId || value.clientId), "informe o alvo da consulta");
export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>;
export const listActivitiesResponseSchema = z.object({ activities: z.array(activitySchema), nextCursor: uuid.nullable() });
export type ListActivitiesResponse = z.infer<typeof listActivitiesResponseSchema>;
export const completeActivityResponseSchema = z.object({ activity: activitySchema, nextActivity: activitySchema.nullable() });
export type CompleteActivityResponse = z.infer<typeof completeActivityResponseSchema>;
export const activityHistoryResponseSchema = z.object({ entries: z.array(activityHistoryEntrySchema), nextCursor: uuid.nullable() });
export type ActivityHistoryResponse = z.infer<typeof activityHistoryResponseSchema>;
