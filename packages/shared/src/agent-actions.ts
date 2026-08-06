import { z } from "zod";

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const agentActionDecisionSchema = z.enum([
  "allowed",
  "blocked",
  "pending_approval",
]);

export const agentActionApprovalStatusSchema = z.enum([
  "not_required",
  "pending",
  "approved",
  "rejected",
]);

export const agentActionStatusSchema = z.enum([
  "recorded",
  "blocked",
  "pending",
  "failed",
]);

export const createAgentActionSchema = z
  .object({
    agent: z.string().trim().min(1).max(100),
    channel: z.string().trim().min(1).max(50),
    action: z.string().trim().min(1).max(150),
    entityType: z.string().trim().min(1).max(100),
    entityId: z.string().trim().min(1).max(150),
    input: jsonObjectSchema.default({}),
    payload: jsonObjectSchema.default({}),
    decision: agentActionDecisionSchema,
    approvalStatus: agentActionApprovalStatusSchema,
    status: agentActionStatusSchema,
    result: z.string().trim().max(2_000).optional(),
    error: z.string().trim().max(2_000).optional(),
  })
  .strict();

export const agentActionResponseSchema = z.object({
  id: z.string().uuid(),
  status: agentActionStatusSchema,
  createdAt: z.string().datetime(),
});

export type CreateAgentAction = z.infer<typeof createAgentActionSchema>;
export type AgentActionResponse = z.infer<typeof agentActionResponseSchema>;
export type AgentActionStatus = z.infer<typeof agentActionStatusSchema>;
