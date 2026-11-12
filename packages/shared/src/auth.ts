import { z } from "zod";

import { acessoSchema } from "./acesso.js";

export const userStatuses = ["invited", "active", "disabled"] as const;

export const userStatusSchema = z.enum(userStatuses);

export type UserStatus = (typeof userStatuses)[number];

// Self-hosted auth contracts (ADR-0008). Framework-free: DTO shapes and types
// only. Credentials and tokens never appear in these schemas' outputs.

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

/**
 * Mesma normalização que todo contrato de auth já aplica (trim + minúsculas).
 * Existe como função porque o login Google normaliza um e-mail que vem de fora
 * do schema — das claims do ID token — e comparar com `users.email` só é
 * correto se as duas pontas passarem pela MESMA regra.
 */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

// Password policy for the internal OS: long enough to resist offline guessing,
// bounded to keep Argon2id input sane.
export const passwordSchema = z.string().min(12).max(200);

const opaqueTokenSchema = z.string().trim().min(16).max(512);

/** Prazos fixos desde o login para novas sessões (PLU-311). */
export const REMEMBERED_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const STANDARD_SESSION_TTL_SECONDS = 12 * 60 * 60;

export const loginRequestSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(200),
    /** Ausente equivale a false nos novos logins. */
    rememberMe: z.boolean().optional(),
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

/** Troca de senha por quem já está logado: exige a senha atual e segue a mesma política da nova. */
export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: passwordSchema,
  })
  .strict();

export const resetConfirmRequestSchema = z
  .object({
    token: opaqueTokenSchema,
    password: passwordSchema,
  })
  .strict();

// --- Login federado (Google Identity Services) ---

/** Provedores federados aceitos. `provider` é coluna, então é enum, não string. */
export const identityProviders = ["google"] as const;

export const identityProviderSchema = z.enum(identityProviders);

export type IdentityProvider = (typeof identityProviders)[number];

/**
 * Corpo `application/x-www-form-urlencoded` que o botão GIS em modo redirect
 * envia para o callback. Deliberadamente NÃO é `.strict()`: o Google acrescenta
 * campos próprios (`select_by`, e `state` quando existe) e recusar o POST
 * inteiro por causa de um campo novo do provedor derrubaria o login sem que
 * nada nosso tivesse mudado. Os limites de tamanho vêm antes de qualquer
 * verificação criptográfica — um corpo gigante não pode custar um JWKS.
 */
export const googleCallbackSchema = z.object({
  credential: z.string().trim().min(1).max(8_192),
  g_csrf_token: z.string().trim().min(1).max(256),
  /** Preferência enviada pelo botão GIS; ausente equivale a sessão de 12h. */
  state: z.enum(["remember", "session"]).optional(),
});

export type GoogleCallback = z.infer<typeof googleCallbackSchema>;

/**
 * Único vocabulário de erro que pode chegar ao browser (e à URL de `/login`).
 * Toda recusa interna — token inválido, e-mail desconhecido, conta desativada,
 * `sub` já vinculado a outra pessoa, e-mail Google não autoritativo — colapsa em
 * `unauthorized`: distinguir esses casos para quem está de fora é exatamente o
 * oráculo de existência de conta que o login por senha já evita.
 */
export const googleLoginErrorCodes = [
  "unauthorized",
  "rate_limited",
  "unavailable",
  "disabled",
] as const;

export const googleLoginErrorCodeSchema = z.enum(googleLoginErrorCodes);

export type GoogleLoginErrorCode = (typeof googleLoginErrorCodes)[number];

export function googleLoginErrorMessage(code: GoogleLoginErrorCode): string {
  switch (code) {
    case "rate_limited":
      return "Muitas tentativas. Aguarde um minuto e tente novamente.";
    case "unavailable":
      return "O login Google está temporariamente indisponível. Use e-mail e senha ou tente novamente.";
    case "disabled":
      return "O login com o Google não está disponível no momento. Use e-mail e senha.";
    case "unauthorized":
    default:
      return "Não foi possível entrar com esta conta Google.";
  }
}

/** Converte um código desconhecido vindo da URL no genérico, sem quebrar a tela. */
export function parseGoogleLoginErrorCode(value: string | undefined): GoogleLoginErrorCode | null {
  if (!value) return null;
  const parsed = googleLoginErrorCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : "unauthorized";
}

export const sessionUserSchema = z
  .object({
    id: z.guid(),
    email: z.string().email(),
    name: z.string(),
    status: userStatusSchema,
    /** O que a pessoa alcança, no modelo de 4 papéis (`acesso.ts`). */
    acesso: acessoSchema,
  })
  .strict();

export const meResponseSchema = sessionUserSchema;

export const loginResponseSchema = z.union([
  z.object({ user: sessionUserSchema }).strict(),
  z.object({ requiresMfa: z.literal(true) }).strict(),
]);
export const mfaCodeRequestSchema = z.object({ code: z.string().trim().min(6).max(64) }).strict();
export const mfaRemoveRequestSchema = z.object({ reason: z.string().trim().min(10).max(500) }).strict();
export const mfaStatusSchema = z.object({ enabled: z.boolean(), recoveryCodesRemaining: z.number().int().nonnegative(), recentlyVerified: z.boolean() }).strict();
export const mfaChallengeSchema = z.object({ pending: z.boolean(), expiresAt: z.iso.datetime().nullable() }).strict();
export const mfaSetupSchema = z.object({ secret: z.string(), otpauthUri: z.string().startsWith("otpauth://"), expiresAt: z.iso.datetime() }).strict();
export const mfaRecoveryCodesSchema = z.object({ recoveryCodes: z.array(z.string()).length(10) }).strict();
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type MfaCodeRequest = z.infer<typeof mfaCodeRequestSchema>;
export type MfaRemoveRequest = z.infer<typeof mfaRemoveRequestSchema>;
export type MfaStatus = z.infer<typeof mfaStatusSchema>;
export type MfaChallenge = z.infer<typeof mfaChallengeSchema>;
export type MfaSetup = z.infer<typeof mfaSetupSchema>;
export type MfaRecoveryCodes = z.infer<typeof mfaRecoveryCodesSchema>;

// Generic, non-enumerating acknowledgement for flows that must not reveal
// whether an account exists (login failure, reset request).
export const authAcknowledgementSchema = z
  .object({
    ok: z.boolean(),
  })
  .strict();

export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;
export type ResetRequest = z.infer<typeof resetRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type ResetConfirmRequest = z.infer<typeof resetConfirmRequestSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type AuthAcknowledgement = z.infer<typeof authAcknowledgementSchema>;
