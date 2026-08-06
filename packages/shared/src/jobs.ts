import { z } from "zod";

export const jobRunStatusSchema = z.enum([
  "queued",
  "running",
  "success",
  "failed",
  "skipped",
]);

export const jobRunInventoryItemSchema = z
  .object({
    id: z.string().uuid(),
    jobKey: z.string().trim().min(1).max(150),
    integrationKey: z.string().trim().min(1).max(100).nullable(),
    scheduledFor: z.string().datetime().nullable(),
    startedAt: z.string().datetime().nullable(),
    finishedAt: z.string().datetime().nullable(),
    status: jobRunStatusSchema,
    attempt: z.number().int().positive(),
    durationMs: z.number().int().nonnegative().nullable(),
    error: z.string().max(2_000).nullable(),
    triggeredBy: z.string().trim().min(1).max(150),
    logRef: z.string().max(500).nullable(),
    createdAt: z.string().datetime(),
  })
  .strict();

export const listJobRunsResponseSchema = z
  .object({
    inventoryOnly: z.literal(true),
    items: z.array(jobRunInventoryItemSchema),
  })
  .strict();

export type JobRunStatus = z.infer<typeof jobRunStatusSchema>;
export type JobRunInventoryItem = z.infer<typeof jobRunInventoryItemSchema>;
export type ListJobRunsResponse = z.infer<typeof listJobRunsResponseSchema>;
