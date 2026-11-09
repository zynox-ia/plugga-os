import type { NomeDeEventoAuditavel } from "@plugga/shared";
import type { AuthUserRecord, CreateSessionData } from "./auth.repository";

export interface MfaFactor {
  userId: string; encryptedSecret: string | null; revision: number; recoveryHashes: string[]; lastTotpStep: number;
  pendingSecret: string | null; pendingExpiresAt: Date | null; pendingSessionHash: string | null;
  failedAttempts: number; blockedUntil: Date | null;
}
export interface MfaPending {
  tokenHash: string; userId: string; revision: number; rememberMe: boolean; expiresAt: Date; attempts: number;
  method: string;
}
export interface MfaSession extends CreateSessionData { createdAt: Date; mfaVerifiedAt: Date | null; mfaRevision: number | null }
export function emptyFactor(userId: string): MfaFactor {
  return { userId, encryptedSecret: null, revision: 0, recoveryHashes: [], lastTotpStep: -1, pendingSecret: null, pendingExpiresAt: null, pendingSessionHash: null, failedAttempts: 0, blockedUntil: null };
}
/** All methods run inside the same transaction holding the affected users' locks. */
export interface MfaTransaction {
  passwordHash(userId: string): Promise<string | null>;
  googleIdentityUser(subject: string): Promise<string | null>;
  user(userId: string): Promise<AuthUserRecord | null>;
  factor(userId: string): Promise<MfaFactor>;
  saveFactor(factor: MfaFactor): Promise<void>;
  session(tokenHash: string): Promise<MfaSession | null>;
  createSession(session: MfaSession): Promise<void>;
  verifySession(tokenHash: string, revision: number, at: Date): Promise<void>;
  revokeSessions(userId: string, exceptHash?: string): Promise<void>;
  challenge(tokenHash: string): Promise<MfaPending | null>;
  saveChallenge(pending: MfaPending): Promise<void>;
  deleteChallenge(tokenHash: string): Promise<void>;
  deleteChallenges(userId: string): Promise<void>;
  audit(eventName: NomeDeEventoAuditavel, userId: string, actorId: string | null, payload?: Record<string, unknown>): Promise<void>;
}
export abstract class MfaRepository {
  abstract findChallenge(tokenHash: string): Promise<MfaPending | null>;
  abstract withUsersLocked<T>(userIds: string[], work: (tx: MfaTransaction) => Promise<T>): Promise<T>;
}
