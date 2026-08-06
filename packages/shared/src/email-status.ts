import { z } from "zod";

export const emailProviderSchema = z.enum(["noop", "mailpit", "brevo"]);

/**
 * Not backed by the `integrations` table: email delivery isn't gated by the
 * mock -> read_only -> bridge -> write cutover state machine (ADR-0005) the
 * way Bitrix/OMIE/etc. are. This just reports which adapter is selected via
 * EMAIL_PROVIDER and whether it can currently deliver — never an address,
 * key, or other secret.
 */
export const emailStatusSchema = z
  .object({
    provider: emailProviderSchema,
    configured: z.boolean(),
  })
  .strict();

export type EmailProvider = z.infer<typeof emailProviderSchema>;
export type EmailStatus = z.infer<typeof emailStatusSchema>;
