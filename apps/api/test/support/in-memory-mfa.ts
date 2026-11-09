import { MfaRepository, emptyFactor, type MfaFactor, type MfaPending, type MfaSession, type MfaTransaction } from "../../src/auth/mfa.repository";
import type { InMemoryStore } from "./in-memory-auth";

/** Transactional test seam shares sessions/users with the existing auth harness. */
export class InMemoryMfaRepository extends MfaRepository {
  readonly factors: Map<string, MfaFactor>;
  readonly challenges: Map<string, MfaPending>;
  readonly events: Array<{ eventName: string; userId: string; actorId: string | null }> = [];
  failAudit = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly store: InMemoryStore) { super(); this.factors = store.mfaFactors; this.challenges = store.mfaChallenges; }
  async findChallenge(hash: string) { return structuredClone(this.challenges.get(hash) ?? null); }
  withUsersLocked<T>(_ids: string[], work: (tx: MfaTransaction) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const factors = structuredClone(this.factors), challenges = structuredClone(this.challenges), sessions = structuredClone(this.store.sessions), events = this.events.length;
      const tx: MfaTransaction = {
        passwordHash: async (id) => this.store.credentials.get(id) ?? null,
        googleIdentityUser: async (subject) => [...this.store.identities.values()].find((identity) => identity.provider === "google" && identity.subject === subject)?.userId ?? null,
        user: async (id) => this.store.users.get(id) ?? null,
        factor: async (id) => structuredClone(this.factors.get(id) ?? emptyFactor(id)),
        saveFactor: async (factor) => { this.factors.set(factor.userId, structuredClone(factor)); },
        session: async (hash) => {
          const value = this.store.sessions.get(hash);
          return value ? { ...value, tokenHash: hash, mfaVerifiedAt: value.mfaVerifiedAt ?? null, mfaRevision: value.mfaRevision ?? null } : null;
        },
        createSession: async (session: MfaSession) => { this.store.sessions.set(session.tokenHash, structuredClone(session)); },
        verifySession: async (hash, revision, at) => { const session = this.store.sessions.get(hash)!; session.mfaVerifiedAt = at; session.mfaRevision = revision; },
        revokeSessions: async (id, except) => { for (const [hash, session] of this.store.sessions) if (session.userId === id && hash !== except) this.store.sessions.delete(hash); },
        challenge: async (hash) => structuredClone(this.challenges.get(hash) ?? null),
        saveChallenge: async (pending) => { this.challenges.set(pending.tokenHash, structuredClone(pending)); },
        deleteChallenge: async (hash) => { this.challenges.delete(hash); },
        deleteChallenges: async (id) => { for (const [hash, c] of this.challenges) if (c.userId === id) this.challenges.delete(hash); },
        audit: async (eventName, userId, actorId) => { if (this.failAudit) throw new Error("audit unavailable"); this.events.push({ eventName, userId, actorId }); },
      };
      try { return await work(tx); }
      catch (error) {
        this.factors.clear(); factors.forEach((v, k) => this.factors.set(k, v));
        this.challenges.clear(); challenges.forEach((v, k) => this.challenges.set(k, v));
        this.store.sessions.clear(); sessions.forEach((v, k) => this.store.sessions.set(k, v));
        this.events.length = events; throw error;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}
