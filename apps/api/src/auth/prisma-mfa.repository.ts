import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditAppender } from "../audit/audit-appender";
import { ServicoIndisponivel } from "../common/errors/dominio";
import { mapAcesso } from "../core/auth/user-access.mapper";
import { PrismaAuthService } from "../prisma/prisma-auth.service";
import { emptyFactor, MfaRepository, type MfaPending, type MfaTransaction } from "./mfa.repository";

@Injectable()
export class PrismaMfaRepository extends MfaRepository {
  constructor(@Inject(PrismaAuthService) private readonly prisma: PrismaAuthService, @Inject(AuditAppender) private readonly appender: AuditAppender) { super(); }
  async findChallenge(tokenHash: string): Promise<MfaPending | null> {
    try { return await this.prisma.mfaChallenge.findUnique({ where: { tokenHash } }); }
    catch { throw new ServicoIndisponivel("A autenticação em duas etapas está indisponível no momento."); }
  }
  async withUsersLocked<T>(userIds: string[], work: (tx: MfaTransaction) => Promise<T>): Promise<T> {
    try { return await this.prisma.$transaction(async (db) => {
      // Same lock for no-MFA issue, challenge completion, enrollment, and recovery.
      const ids = [...new Set(userIds)].sort();
      await db.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE`);
      const tx: MfaTransaction = {
        passwordHash: async (userId) => (await db.userCredential.findUnique({ where: { userId } }))?.passwordHash ?? null,
        googleIdentityUser: async (subject) => (await db.userIdentity.findUnique({ where: { provider_subject: { provider: "google", subject } } }))?.userId ?? null,
        user: async (id) => {
          const user = await db.user.findUnique({ where: { id }, include: { platformRoles: { include: { role: true } }, departamentos: true, agentIdentity: true } });
          return user ? { id: user.id, email: user.email, name: user.name, status: user.status, createdAt: user.createdAt, tipo: user.agentIdentity ? "agente_ia" : "pessoa", acesso: mapAcesso(user) } : null;
        },
        factor: async (userId) => (await db.userMfa.findUnique({ where: { userId } })) ?? emptyFactor(userId),
        saveFactor: async (factor) => { await db.userMfa.upsert({ where: { userId: factor.userId }, create: factor, update: factor }); },
        session: (tokenHash) => db.session.findUnique({ where: { tokenHash } }),
        createSession: async (session) => { await db.session.create({ data: session }); },
        verifySession: async (tokenHash, mfaRevision, mfaVerifiedAt) => { await db.session.update({ where: { tokenHash }, data: { mfaRevision, mfaVerifiedAt } }); },
        revokeSessions: async (userId, exceptHash) => { await db.session.deleteMany({ where: { userId, ...(exceptHash ? { tokenHash: { not: exceptHash } } : {}) } }); },
        challenge: (tokenHash) => db.mfaChallenge.findUnique({ where: { tokenHash } }),
        saveChallenge: async (pending) => { await db.mfaChallenge.upsert({ where: { tokenHash: pending.tokenHash }, create: pending, update: pending }); },
        deleteChallenge: async (tokenHash) => { await db.mfaChallenge.deleteMany({ where: { tokenHash } }); },
        deleteChallenges: async (userId) => { await db.mfaChallenge.deleteMany({ where: { userId } }); },
        audit: (eventName, userId, actorId, payload = {}) => this.appender.append(db, { eventName, entityType: "user", entityId: userId, actorType: actorId ? "user" : "system", actorId, payload }),
      };
      return work(tx);
    }, { maxWait: 10_000, timeout: 10_000 }); }
    catch (error) {
      // Driver errors can include credential hashes and encrypted factor parameters.
      if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError || error instanceof Prisma.PrismaClientInitializationError || error instanceof Prisma.PrismaClientRustPanicError || error instanceof Prisma.PrismaClientValidationError) {
        throw new ServicoIndisponivel("A autenticação em duas etapas está indisponível no momento.");
      }
      throw error;
    }
  }
}
