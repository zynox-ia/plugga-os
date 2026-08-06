import { z } from "zod";

export const whatsappOriginDomainSchema = z.enum(["crm", "ops", "financeiro"]);
export const whatsappAudienceSchema = z.enum(["transactional", "campaign"]);
export const whatsappPrioritySchema = z.enum(["normal", "critical"]);

const textContentSchema = z.object({
  kind: z.literal("text"),
  text: z.string().trim().min(1).max(4_096),
});

const templateContentSchema = z.object({
  kind: z.literal("template"),
  name: z.string().trim().min(1).max(120),
  variables: z.record(z.string(), z.string().max(1_000)).default({}),
});

export const whatsappSendSchema = z
  .object({
    destination: z.string().regex(/^\+[1-9]\d{7,14}$/, "destination must use E.164 format"),
    originDomain: whatsappOriginDomainSchema,
    audience: whatsappAudienceSchema.default("transactional"),
    priority: whatsappPrioritySchema.default("normal"),
    optedOut: z.boolean().default(false),
    content: z.discriminatedUnion("kind", [textContentSchema, templateContentSchema]),
  })
  .strict();

export const whatsappSendStatusSchema = z.enum([
  "queued",
  "blocked",
  "pending_approval",
]);

export const whatsappSendResponseSchema = z.object({
  messageId: z.string().startsWith("mock_"),
  status: whatsappSendStatusSchema,
  simulated: z.literal(true),
  maskedDestination: z.string(),
  reason: z.enum(["mock_only", "opted_out", "approval_required"]),
});

export type WhatsappSendRequest = z.infer<typeof whatsappSendSchema>;
export type WhatsappSendResponse = z.infer<typeof whatsappSendResponseSchema>;
