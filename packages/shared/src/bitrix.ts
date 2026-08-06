import { z } from "zod";

export const triggerBitrixImportResponseSchema = z
  .object({
    domain: z.string().trim().min(1),
    jobKey: z.string().trim().min(1),
    jobId: z.string().trim().min(1),
    deduped: z.boolean(),
  })
  .strict();

export type TriggerBitrixImportResponse = z.infer<
  typeof triggerBitrixImportResponseSchema
>;
