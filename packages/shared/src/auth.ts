import { z } from "zod";

export const roleKeys = [
  "admin",
  "diretoria",
  "comercial",
  "pluggamob",
  "financeiro",
  "opm",
  "tech",
  "viewer",
] as const;

export const roleKeySchema = z.enum(roleKeys);

export type RoleKey = z.infer<typeof roleKeySchema>;

// Self-hosted auth contracts (ADR-0008). Framework-free: DTO shapes and types
// only. Credentials and tokens never appear in these schemas' outputs.

const emailSchema = z.string().trim().toLowerCase().email().max(254);

// Password policy for the internal OS: long enough to resist offline guessing,
// bounded to keep Argon2id input sane.
export const passwordSchema = z.string().min(12).max(200);

const opaqueTokenSchema = z.string().trim().min(16).max(512);

export const loginRequestSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(200),
  })
  .strict();

export const inviteRequestSchema = z
  .object({
    email: emailSchema,
    name: z.string().trim().min(1).max(150),
    roles: z.array(roleKeySchema).min(1),
  })
  .strict();

export const acceptInviteRequestSchema = z
  .object({
    token: opaqueTokenSchema,
    password: passwordSchema,
  })
  .strict();

export const resetRequestSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetConfirmRequestSchema = z
  .object({
    token: opaqueTokenSchema,
    password: passwordSchema,
  })
  .strict();

export const assignRolesRequestSchema = z
  .object({
    roles: z.array(roleKeySchema).min(1),
  })
  .strict();

export const sessionUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    status: z.string(),
    roles: z.array(roleKeySchema),
  })
  .strict();

export const meResponseSchema = sessionUserSchema;

export const loginResponseSchema = z
  .object({
    user: sessionUserSchema,
  })
  .strict();

export const userSummarySchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    status: z.string(),
    roles: z.array(roleKeySchema),
    createdAt: z.string().datetime(),
  })
  .strict();

// Generic, non-enumerating acknowledgement for flows that must not reveal
// whether an account exists (login failure, reset request).
export const authAcknowledgementSchema = z
  .object({
    ok: z.boolean(),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type InviteRequest = z.infer<typeof inviteRequestSchema>;
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;
export type ResetRequest = z.infer<typeof resetRequestSchema>;
export type ResetConfirmRequest = z.infer<typeof resetConfirmRequestSchema>;
export type AssignRolesRequest = z.infer<typeof assignRolesRequestSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type UserSummary = z.infer<typeof userSummarySchema>;
export type AuthAcknowledgement = z.infer<typeof authAcknowledgementSchema>;
