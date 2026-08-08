import { randomUUID } from "node:crypto";

import { hash as argon2Hash } from "@node-rs/argon2";
import { flattenRoles, type UserAccess } from "@plugga/shared";

import { AuditRepository } from "../../src/audit/audit.repository";
import type { AuthPrincipal } from "../../src/core/auth/auth.types";
import { SessionLookupRepository } from "../../src/core/auth/session-lookup.repository";
import { EmailPort, type TransactionalEmail } from "../../src/email/email.port";
import {
  AuthRepository,
  type AuthUserRecord,
  type CreateAuthTokenData,
  type CreateInvitedUserData,
  type CreateSessionData,
  type SetPasswordOptions,
  type TeamFilter,
  type TeamMemberRecord,
  type ValidAuthToken,
} from "../../src/auth/auth.repository";

/**
 * Dublês em memória dos seams de auth, compartilhados pelos e2e de sessão e de
 * equipe. Ficam num arquivo só porque os dois exercitam o mesmo estado — dois
 * armazenamentos paralelos divergiriam na primeira regra nova de acesso.
 */

// Alinhado com PasswordService; parâmetros baixos o bastante para o teste rodar.
export const argon2Options = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

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

  userByEmail(email: string): StoredUser | undefined {
    return [...this.users.values()].find((user) => user.email === email);
  }

  clear(): void {
    this.users.clear();
    this.credentials.clear();
    this.sessions.clear();
    this.tokens.clear();
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

  async createAuthToken(data: CreateAuthTokenData): Promise<void> {
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
    token.consumedAt = consumedAt;
    this.store.credentials.set(userId, passwordHash);
    const user = this.store.users.get(userId);
    if (user && options.activateUser) {
      user.status = "active";
    }
    if (options.revokeSessions) {
      await this.deleteSessionsForUser(userId);
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
