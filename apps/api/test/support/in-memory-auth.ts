import { randomUUID } from "node:crypto";

import { hash as argon2Hash } from "@node-rs/argon2";
import { flattenRoles, type UserAccess } from "@plugga/shared";

import { argon2Options } from "../../src/auth/argon2-options";
import { AuditRepository } from "../../src/audit/audit.repository";
import type { AuthPrincipal } from "../../src/core/auth/auth.types";
import { SessionLookupRepository } from "../../src/core/auth/session-lookup.repository";
import { EmailPort, type TransactionalEmail } from "../../src/email/email.port";
import {
  AuthRepository,
  IdentityLinkError,
  type AuthUserRecord,
  type CreateAuthTokenData,
  type CreateInvitedUserData,
  type CreateSessionData,
  type LinkIdentityData,
  type SetPasswordOptions,
  type TeamFilter,
  type TeamMemberRecord,
  type UserIdentityRecord,
  type ValidAuthToken,
} from "../../src/auth/auth.repository";

/**
 * Dublês em memória dos seams de auth, compartilhados pelos e2e de sessão e de
 * equipe. Ficam num arquivo só porque os dois exercitam o mesmo estado — dois
 * armazenamentos paralelos divergiriam na primeira regra nova de acesso.
 */

export { argon2Options };

export interface StoredUser {
  id: string;
  email: string;
  name: string;
  status: string;
  createdAt: Date;
  access: UserAccess;
}

interface StoredSession {
  userId: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
}

interface StoredToken {
  id: string;
  userId: string;
  type: "invite" | "reset";
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

/** Acesso vazio é o default: cada teste concede exatamente o que quer exercitar. */
export function access(overrides: Partial<UserAccess> = {}): UserAccess {
  return { platformRoles: [], companies: [], ...overrides };
}

export class InMemoryStore {
  readonly users = new Map<string, StoredUser>();
  readonly credentials = new Map<string, string>();
  readonly sessions = new Map<string, StoredSession>();
  readonly tokens = new Map<string, StoredToken>();
  readonly identities = new Map<string, UserIdentityRecord>();

  userByEmail(email: string): StoredUser | undefined {
    return [...this.users.values()].find((user) => user.email === email);
  }

  identityFor(userId: string, provider = "google"): UserIdentityRecord | undefined {
    return [...this.identities.values()].find(
      (identity) => identity.userId === userId && identity.provider === provider,
    );
  }

  clear(): void {
    this.users.clear();
    this.credentials.clear();
    this.sessions.clear();
    this.tokens.clear();
    this.identities.clear();
  }

  /** Cria uma pessoa ativa com senha — o atalho que todo teste precisa. */
  async addUser(input: {
    email: string;
    name?: string;
    password?: string;
    status?: string;
    access?: UserAccess;
  }): Promise<StoredUser> {
    const user: StoredUser = {
      id: randomUUID(),
      email: input.email,
      name: input.name ?? input.email,
      status: input.status ?? "active",
      createdAt: new Date(),
      access: input.access ?? access(),
    };
    this.users.set(user.id, user);
    if (input.password) {
      this.credentials.set(user.id, await argon2Hash(input.password, argon2Options));
    }
    return user;
  }
}

export class InMemoryAuthRepository extends AuthRepository {
  constructor(private readonly store: InMemoryStore) {
    super();
  }

  private toRecord(user: StoredUser): AuthUserRecord {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      createdAt: user.createdAt,
      access: user.access,
    };
  }

  async findUserByEmail(email: string): Promise<AuthUserRecord | null> {
    const user = this.store.userByEmail(email);
    return user ? this.toRecord(user) : null;
  }

  async findUserById(id: string): Promise<AuthUserRecord | null> {
    const user = this.store.users.get(id);
    return user ? this.toRecord(user) : null;
  }

  async findPasswordHash(userId: string): Promise<string | null> {
    return this.store.credentials.get(userId) ?? null;
  }

  async createSession(data: CreateSessionData): Promise<void> {
    this.store.sessions.set(data.tokenHash, {
      userId: data.userId,
      expiresAt: data.expiresAt,
      absoluteExpiresAt: data.absoluteExpiresAt,
    });
  }

  async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    this.store.sessions.delete(tokenHash);
  }

  async deleteSessionsForUser(userId: string): Promise<void> {
    for (const [hash, session] of this.store.sessions) {
      if (session.userId === userId) {
        this.store.sessions.delete(hash);
      }
    }
  }

  async createInvitedUser(data: CreateInvitedUserData): Promise<AuthUserRecord> {
    const user: StoredUser = {
      id: randomUUID(),
      email: data.email,
      name: data.name,
      status: "invited",
      createdAt: new Date(),
      access: data.access,
    };
    this.store.users.set(user.id, user);
    return this.toRecord(user);
  }

  async replaceAuthToken(data: CreateAuthTokenData): Promise<void> {
    for (const [id, token] of this.store.tokens) {
      if (token.userId === data.userId && token.type === data.type && token.consumedAt === null) {
        this.store.tokens.delete(id);
      }
    }
    const id = randomUUID();
    this.store.tokens.set(id, {
      id,
      userId: data.userId,
      type: data.type,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      consumedAt: null,
    });
  }

  async findValidToken(
    tokenHash: string,
    type: "invite" | "reset",
    now: Date,
  ): Promise<ValidAuthToken | null> {
    const token = [...this.store.tokens.values()].find(
      (candidate) =>
        candidate.tokenHash === tokenHash &&
        candidate.type === type &&
        candidate.consumedAt === null &&
        candidate.expiresAt > now,
    );
    return token ? { id: token.id, userId: token.userId } : null;
  }

  async consumeTokenAndSetPassword(
    tokenId: string,
    userId: string,
    passwordHash: string,
    consumedAt: Date,
    options: SetPasswordOptions,
  ): Promise<void> {
    const token = this.store.tokens.get(tokenId);
    if (!token || token.consumedAt !== null) {
      throw new Error("auth token already consumed");
    }
    const user = this.store.users.get(userId);
    // Espelha a guarda do PrismaAuthRepository: convite só ativa quem ainda
    // está `invited` — sem isso o teste passaria aqui e falharia só em produção.
    if (options.activateUser && user?.status !== "invited") {
      throw new Error("user is not pending activation");
    }
    token.consumedAt = consumedAt;
    this.store.credentials.set(userId, passwordHash);
    if (user && options.activateUser) {
      user.status = "active";
    }
    if (options.revokeSessions) {
      await this.deleteSessionsForUser(userId);
    }
  }

  async findIdentityBySubject(
    provider: "google",
    subject: string,
  ): Promise<UserIdentityRecord | null> {
    const identity = [...this.store.identities.values()].find(
      (candidate) => candidate.provider === provider && candidate.subject === subject,
    );
    return identity ?? null;
  }

  // Espelha as DUAS constraints únicas e a transação do PrismaAuthRepository: um
  // dublê mais permissivo deixaria a suíte verde exatamente nos casos que só
  // falham em produção — `sub` reatribuído e convidado reativado após desativação.
  async linkIdentity(data: LinkIdentityData): Promise<AuthUserRecord> {
    const user = this.store.users.get(data.userId);
    if (!user) {
      throw new IdentityLinkError("user_not_found");
    }
    if (user.status !== "active" && user.status !== "invited") {
      throw new IdentityLinkError("user_not_eligible");
    }
    const subjectTomado = [...this.store.identities.values()].some(
      (identity) => identity.provider === data.provider && identity.subject === data.subject,
    );
    const usuarioJaVinculado = [...this.store.identities.values()].some(
      (identity) => identity.provider === data.provider && identity.userId === data.userId,
    );
    if (subjectTomado || usuarioJaVinculado) {
      throw new IdentityLinkError("conflict");
    }

    const id = randomUUID();
    this.store.identities.set(id, {
      id,
      userId: data.userId,
      provider: data.provider,
      subject: data.subject,
      emailAtLink: data.email,
      lastObservedEmail: data.email,
      hostedDomain: data.hostedDomain,
    });

    if (user.status === "invited") {
      user.status = "active";
      for (const token of this.store.tokens.values()) {
        if (token.userId === data.userId && token.type === "invite" && token.consumedAt === null) {
          token.consumedAt = data.now;
        }
      }
    }

    return this.toRecord(user);
  }

  async recordIdentityLogin(
    identityId: string,
    email: string,
    hostedDomain: string | null,
  ): Promise<void> {
    const identity = this.store.identities.get(identityId);
    if (identity) {
      identity.lastObservedEmail = email;
      identity.hostedDomain = hostedDomain;
    }
  }

  async replaceAccess(userId: string, next: UserAccess): Promise<AuthUserRecord | null> {
    const user = this.store.users.get(userId);
    if (!user) {
      return null;
    }
    user.access = next;
    return this.toRecord(user);
  }

  async deactivateUser(userId: string): Promise<AuthUserRecord | null> {
    const user = this.store.users.get(userId);
    if (!user) {
      return null;
    }
    // Espelha o PrismaAuthRepository: desativar consome os tokens pendentes.
    for (const token of this.store.tokens.values()) {
      if (token.userId === userId && token.consumedAt === null) {
        token.consumedAt = new Date();
      }
    }
    user.status = "disabled";
    return this.toRecord(user);
  }

  async listTeam(filter: TeamFilter): Promise<TeamMemberRecord[]> {
    return [...this.store.users.values()]
      .filter((user) => {
        if (filter.status && user.status !== filter.status) {
          return false;
        }
        if (!filter.companyId && !filter.departmentId) {
          return true;
        }
        // Empresa e departamento têm de casar no mesmo membership, como no SQL.
        return user.access.companies.some(
          (company) =>
            (!filter.companyId || company.companyId === filter.companyId) &&
            (!filter.departmentId ||
              company.departments.some(
                (department) => department.departmentId === filter.departmentId,
              )),
        );
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((user) => this.toRecord(user));
  }
}

export class InMemorySessionLookup extends SessionLookupRepository {
  constructor(private readonly store: InMemoryStore) {
    super();
  }

  async resolvePrincipal(tokenHash: string): Promise<AuthPrincipal | null> {
    const session = this.store.sessions.get(tokenHash);
    if (!session) {
      return null;
    }
    const now = new Date();
    const user = this.store.users.get(session.userId);
    if (session.expiresAt <= now || session.absoluteExpiresAt <= now || user?.status !== "active") {
      this.store.sessions.delete(tokenHash);
      return null;
    }
    return { id: user.id, kind: "user", roles: flattenRoles(user.access) };
  }
}

export class CapturingEmailPort extends EmailPort {
  readonly sent: TransactionalEmail[] = [];
  /** When true, the next send throws (simulates provider outage) then clears. */
  failNext = false;

  async sendTransactional(email: TransactionalEmail): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("provider down HTTP 503");
    }
    this.sent.push(email);
  }

  lastTokenFor(template: "invite" | "reset"): string {
    const email = [...this.sent].reverse().find((entry) => entry.template === template);
    if (!email) {
      throw new Error(`no ${template} email captured`);
    }
    return new URL(email.variables.link).searchParams.get("token") ?? "";
  }
}

export class NoopAuditRepository extends AuditRepository {
  async appendEvent(): Promise<void> {}
  async appendTrail(): Promise<never> {
    throw new Error("not used in auth e2e");
  }
}
