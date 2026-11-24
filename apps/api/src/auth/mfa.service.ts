import { randomBytes } from "node:crypto";
import { ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { REMEMBERED_SESSION_TTL_SECONDS, STANDARD_SESSION_TTL_SECONDS, sessionUserSchema, type MfaStatus, type SessionUser } from "@plugga/shared";
import { SessionCache } from "../core/auth/session-cache";
import { generateOpaqueToken, hashToken } from "../core/auth/token.util";
import type { AuthUserRecord } from "./auth.repository";
import { encodeBase32, MfaCrypto, newRecoveryCodes, recoveryHash, verifyTotp } from "./mfa-crypto";
import { MfaRepository, type MfaFactor, type MfaPending, type MfaSession, type MfaTransaction } from "./mfa.repository";
import type { SessionContext } from "./session.service";

export const MFA_PENDING_COOKIE = "plugga_mfa_pending";
export const MFA_WINDOW_MS = 300_000;
export type MfaLoginResult = { token: string; user: SessionUser } | { requiresMfa: true; pendingToken: string };
export type MfaPrimaryProof = { method: "password"; credentialHash: string } | { method: "google"; subject: string };
const invalid = () => new UnauthorizedException("Código inválido ou desafio expirado.");

@Injectable()
export class MfaService {
  private readonly crypto: MfaCrypto;
  constructor(@Inject(MfaRepository) private readonly repository: MfaRepository,
    @Inject(ConfigService) config: ConfigService,
    @Inject(SessionCache) private readonly cache: SessionCache) {
    this.crypto = new MfaCrypto(config.get<string>("MFA_ENCRYPTION_KEY"));
  }

  /** Primary identity proof is complete, but the full session may still be withheld. */
  beginLogin(userId: string, context: SessionContext, proof: MfaPrimaryProof): Promise<MfaLoginResult> {
    return this.repository.withUsersLocked([userId], async (tx) => {
      const user = await this.human(tx, userId);
      if (proof.method === "password" ? await tx.passwordHash(userId) !== proof.credentialHash : await tx.googleIdentityUser(proof.subject) !== userId) throw invalid();
      const factor = await tx.factor(userId);
      if (!factor.encryptedSecret) return this.issue(tx, user, context, factor, false);
      // Fail closed for protected accounts when the dedicated key is unavailable/corrupt.
      this.crypto.decrypt(factor.encryptedSecret, userId);
      const pendingToken = generateOpaqueToken();
      await tx.deleteChallenges(userId);
      await tx.saveChallenge({ tokenHash: hashToken(pendingToken), userId, revision: factor.revision,
        rememberMe: context.rememberMe ?? false, expiresAt: new Date(Date.now() + MFA_WINDOW_MS), attempts: 0, method: proof.method });
      return { requiresMfa: true, pendingToken };
    });
  }

  async challenge(rawToken: string | undefined): Promise<{ pending: boolean; expiresAt: string | null }> {
    const pending = await this.lookup(rawToken);
    if (!pending) return { pending: false, expiresAt: null };
    return this.repository.withUsersLocked([pending.userId], async (tx) => {
      const current = await tx.challenge(pending.tokenHash);
      const user = await tx.user(pending.userId), factor = await tx.factor(pending.userId);
      const valid = user?.status === "active" && user.tipo !== "agente_ia" && this.validChallenge(current, factor);
      return { pending: !!valid, expiresAt: valid ? current!.expiresAt.toISOString() : null };
    });
  }

  async cancel(rawToken: string | undefined): Promise<{ ok: true }> {
    const pending = await this.lookup(rawToken);
    if (pending) await this.repository.withUsersLocked([pending.userId], (tx) => tx.deleteChallenge(pending.tokenHash));
    return { ok: true };
  }

  async verify(rawToken: string | undefined, code: string, context: SessionContext) {
    const pending = await this.lookup(rawToken);
    if (!pending) throw invalid();
    const result = await this.repository.withUsersLocked([pending.userId], async (tx) => {
      const user = await this.human(tx, pending.userId), factor = await tx.factor(pending.userId);
      const current = await tx.challenge(pending.tokenHash);
      if (!this.validChallenge(current, factor)) return null;
      current!.attempts += 1;
      await tx.saveChallenge(current!);
      if (!await this.consumeCode(tx, factor, code)) return null;
      await tx.deleteChallenge(pending.tokenHash);
      const full = await this.issue(tx, user, { ...context, rememberMe: current!.rememberMe }, factor, true);
      await tx.audit("auth.mfa.verified", user.id, user.id, { purpose: "login" });
      await tx.audit("auth.login.succeeded", user.id, user.id, { method: current!.method });
      return { ...full, rememberMe: current!.rememberMe };
    });
    if (!result) throw invalid();
    return result;
  }

  status(userId: string, sessionHash: string): Promise<MfaStatus> {
    return this.repository.withUsersLocked([userId], async (tx) => {
      await this.human(tx, userId);
      const session = await this.session(tx, userId, sessionHash), factor = await tx.factor(userId);
      return { enabled: !!factor.encryptedSecret, recoveryCodesRemaining: factor.recoveryHashes.length,
        recentlyVerified: !!factor.encryptedSecret && this.recent(session, factor) };
    });
  }

  setup(userId: string, sessionHash: string) {
    return this.repository.withUsersLocked([userId], async (tx) => {
      const user = await this.human(tx, userId), session = await this.session(tx, userId, sessionHash), factor = await tx.factor(userId);
      if (factor.encryptedSecret) this.requireRecent(session, factor);
      else this.requireFreshPrimary(session);
      const secret = encodeBase32(randomBytes(20));
      factor.pendingSecret = this.crypto.encrypt(secret, userId);
      factor.pendingExpiresAt = new Date(Date.now() + MFA_WINDOW_MS);
      factor.pendingSessionHash = sessionHash;
      await tx.saveFactor(factor);
      const label = encodeURIComponent(`Plugga:${user.email}`);
      return { secret, otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=Plugga&algorithm=SHA1&digits=6&period=30`, expiresAt: factor.pendingExpiresAt.toISOString() };
    });
  }

  async enable(userId: string, sessionHash: string, code: string) {
    const result = await this.repository.withUsersLocked([userId], async (tx) => {
      await this.human(tx, userId);
      const session = await this.session(tx, userId, sessionHash), factor = await tx.factor(userId);
      const rotating = !!factor.encryptedSecret;
      if (rotating) this.requireRecent(session, factor);
      else this.requireFreshPrimary(session);
      if (!factor.pendingSecret || factor.pendingSessionHash !== sessionHash || !factor.pendingExpiresAt || factor.pendingExpiresAt.getTime() <= Date.now() || this.blocked(factor)) return null;
      const secret = this.crypto.decrypt(factor.pendingSecret, userId);
      const step = verifyTotp(secret, code, Date.now(), -1);
      if (step === null) { await this.failedCode(tx, factor); return null; }
      const recoveryCodes = newRecoveryCodes();
      factor.encryptedSecret = factor.pendingSecret;
      factor.lastTotpStep = step;
      factor.recoveryHashes = recoveryCodes.map((c) => recoveryHash(userId, c));
      await this.changed(tx, factor, sessionHash);
      await tx.audit(rotating ? "auth.mfa.rotated" : "auth.mfa.enabled", userId, userId);
      return { recoveryCodes };
    });
    if (!result) throw invalid();
    await this.cache.invalidateAllForUser(userId);
    return result;
  }

  async confirm(userId: string, sessionHash: string, code: string): Promise<{ ok: true }> {
    const valid = await this.repository.withUsersLocked([userId], async (tx) => {
      await this.human(tx, userId); await this.session(tx, userId, sessionHash);
      const factor = await tx.factor(userId);
      if (!await this.consumeCode(tx, factor, code)) return false;
      await tx.verifySession(sessionHash, factor.revision, new Date());
      await tx.audit("auth.mfa.verified", userId, userId, { purpose: "management" });
      return true;
    });
    if (!valid) throw invalid();
    return { ok: true };
  }

  async recoveryCodes(userId: string, sessionHash: string) {
    const result = await this.repository.withUsersLocked([userId], async (tx) => {
      await this.human(tx, userId);
      const factor = await tx.factor(userId);
      const session = await this.session(tx, userId, sessionHash);
      this.requireRecent(session, factor);
      const recoveryCodes = newRecoveryCodes();
      factor.recoveryHashes = recoveryCodes.map((c) => recoveryHash(userId, c));
      await this.changed(tx, factor, sessionHash, session.mfaVerifiedAt!);
      await tx.audit("auth.mfa.recovery_codes_rotated", userId, userId);
      return { recoveryCodes };
    });
    await this.cache.invalidateAllForUser(userId); return result;
  }

  async disable(userId: string, sessionHash: string): Promise<{ ok: true }> {
    await this.repository.withUsersLocked([userId], async (tx) => {
      await this.human(tx, userId);
      const factor = await tx.factor(userId);
      const session = await this.session(tx, userId, sessionHash);
      this.requireRecent(session, factor);
      this.clear(factor);
      await this.changed(tx, factor, sessionHash, session.mfaVerifiedAt!);
      await tx.audit("auth.mfa.disabled", userId, userId);
    });
    await this.cache.invalidateAllForUser(userId); return { ok: true };
  }

  async remove(actorId: string, sessionHash: string, targetId: string, reason: string): Promise<{ ok: true }> {
    if (actorId === targetId) throw new ForbiddenException("Use a desativação da própria proteção.");
    await this.repository.withUsersLocked([actorId, targetId], async (tx) => {
      const actor = await this.human(tx, actorId); await this.recoveryTarget(tx, targetId);
      if (actor.acesso.plataforma !== "desenvolvedor") throw new ForbiddenException("Somente Desenvolvedor pode remover a proteção de outra conta.");
      this.requireRecent(await this.session(tx, actorId, sessionHash), await tx.factor(actorId));
      await this.removeFactor(tx, targetId);
      // Free text may contain PII; retain a correlation hash, never the text itself.
      await tx.audit("auth.mfa.removed", targetId, actorId, { reasonHash: hashToken(reason) });
    });
    await this.cache.invalidateAllForUser(targetId); return { ok: true };
  }

  /** Operator-only CLI entry point. This method is deliberately absent from HTTP. */
  async emergencyRemove(targetId: string, reason: string, authorization: string): Promise<void> {
    if (authorization !== "AUTORIZADO_PELO_ANDRE" || reason.trim().length < 10) throw new ForbiddenException("Autorização operacional necessária.");
    await this.repository.withUsersLocked([targetId], async (tx) => {
      await this.recoveryTarget(tx, targetId); await this.removeFactor(tx, targetId);
      await tx.audit("auth.mfa.emergency_removed", targetId, null, { operator: "andre", reasonHash: hashToken(reason) });
    });
    await this.cache.invalidateAllForUser(targetId);
  }

  private async lookup(raw: string | undefined) { return raw ? this.repository.findChallenge(hashToken(raw)) : null; }
  private validChallenge(pending: MfaPending | null, factor: MfaFactor): boolean {
    return !!pending && !!factor.encryptedSecret && pending.revision === factor.revision && pending.attempts < 5 && pending.expiresAt.getTime() > Date.now();
  }
  private async human(tx: MfaTransaction, userId: string): Promise<AuthUserRecord> {
    const user = await tx.user(userId);
    if (!user || user.tipo === "agente_ia" || user.status !== "active") throw invalid();
    return user;
  }
  private async recoveryTarget(tx: MfaTransaction, userId: string): Promise<void> {
    const user = await tx.user(userId);
    if (!user || user.tipo === "agente_ia" || !["active", "invited", "disabled"].includes(user.status)) throw invalid();
  }
  private async session(tx: MfaTransaction, userId: string, hash: string): Promise<MfaSession> {
    const session = await tx.session(hash);
    if (!session || session.userId !== userId || session.expiresAt.getTime() <= Date.now() || session.absoluteExpiresAt.getTime() <= Date.now()) throw invalid();
    return session;
  }
  private recent(session: MfaSession, factor: MfaFactor): boolean {
    return session.mfaRevision === factor.revision && !!session.mfaVerifiedAt && session.mfaVerifiedAt.getTime() <= Date.now() && session.mfaVerifiedAt.getTime() > Date.now() - MFA_WINDOW_MS;
  }
  private requireFreshPrimary(session: MfaSession) {
    const createdAt = session.createdAt?.getTime();
    if (!createdAt || createdAt > Date.now() || createdAt <= Date.now() - MFA_WINDOW_MS) throw new ForbiddenException("Entre novamente para configurar a autenticação em duas etapas.");
  }
  private requireRecent(session: MfaSession, factor: MfaFactor) {
    if (!factor.encryptedSecret || !this.recent(session, factor)) throw new ForbiddenException("Confirme o segundo fator para continuar.");
    this.crypto.decrypt(factor.encryptedSecret, factor.userId);
  }
  private blocked(factor: MfaFactor) { return !!factor.blockedUntil && factor.blockedUntil.getTime() > Date.now(); }
  private async failedCode(tx: MfaTransaction, factor: MfaFactor) {
    if (factor.blockedUntil && factor.blockedUntil.getTime() <= Date.now()) factor.failedAttempts = 0;
    factor.failedAttempts += 1;
    if (factor.failedAttempts >= 5) factor.blockedUntil = new Date(Date.now() + MFA_WINDOW_MS);
    await tx.saveFactor(factor);
  }
  private async consumeCode(tx: MfaTransaction, factor: MfaFactor, code: string): Promise<boolean> {
    if (!factor.encryptedSecret || this.blocked(factor)) return false;
    const secret = this.crypto.decrypt(factor.encryptedSecret, factor.userId);
    const step = verifyTotp(secret, code, Date.now(), factor.lastTotpStep);
    const index = factor.recoveryHashes.indexOf(recoveryHash(factor.userId, code));
    if (step === null && index === -1) { await this.failedCode(tx, factor); return false; }
    if (step !== null) factor.lastTotpStep = step; else factor.recoveryHashes.splice(index, 1);
    factor.failedAttempts = 0; factor.blockedUntil = null;
    await tx.saveFactor(factor); return true;
  }
  private clear(factor: MfaFactor) { factor.encryptedSecret = null; factor.recoveryHashes = []; factor.lastTotpStep = -1; }
  private async changed(tx: MfaTransaction, factor: MfaFactor, keepHash?: string, verifiedAt = new Date()) {
    factor.revision += 1; factor.pendingSecret = null; factor.pendingExpiresAt = null; factor.pendingSessionHash = null;
    factor.failedAttempts = 0; factor.blockedUntil = null;
    await tx.saveFactor(factor); await tx.deleteChallenges(factor.userId); await tx.revokeSessions(factor.userId, keepHash);
    if (keepHash) await tx.verifySession(keepHash, factor.revision, verifiedAt);
  }
  private async removeFactor(tx: MfaTransaction, userId: string) { const factor = await tx.factor(userId); this.clear(factor); await this.changed(tx, factor); }
  private async issue(tx: MfaTransaction, user: AuthUserRecord, context: SessionContext, factor: MfaFactor, verified: boolean) {
    const token = generateOpaqueToken(), now = new Date();
    const ttl = context.rememberMe ? REMEMBERED_SESSION_TTL_SECONDS : STANDARD_SESSION_TTL_SECONDS;
    const expiresAt = new Date(now.getTime() + ttl * 1000);
    await tx.createSession({ userId: user.id, tokenHash: hashToken(token), expiresAt, absoluteExpiresAt: expiresAt,
      createdAt: now,
      ip: context.ip ?? null, userAgent: context.userAgent ?? null, mfaVerifiedAt: verified ? now : null, mfaRevision: verified ? factor.revision : null });
    return { token, user: sessionUserSchema.parse({ id: user.id, email: user.email, name: user.name, status: user.status, acesso: user.acesso }) };
  }
}
