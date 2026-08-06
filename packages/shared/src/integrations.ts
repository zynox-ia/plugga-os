import { z } from "zod";

export const integrationModeSchema = z.enum([
  "mock",
  "read_only",
  "bridge",
  "write",
]);

export const integrationStatusSchema = z.enum([
  "healthy",
  "degraded",
  "down",
  "unknown",
]);

export const integrationSummarySchema = z
  .object({
    id: z.string().uuid(),
    key: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(150),
    mode: integrationModeSchema,
    status: integrationStatusSchema,
    lastSyncAt: z.string().datetime().nullable(),
    lastError: z.string().max(2_000).nullable(),
    owner: z.string().trim().min(1).max(150),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const listIntegrationsResponseSchema = z
  .object({
    items: z.array(integrationSummarySchema),
  })
  .strict();

export type IntegrationMode = z.infer<typeof integrationModeSchema>;
export type IntegrationStatus = z.infer<typeof integrationStatusSchema>;
export type IntegrationSummary = z.infer<typeof integrationSummarySchema>;
export type ListIntegrationsResponse = z.infer<typeof listIntegrationsResponseSchema>;
