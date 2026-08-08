import type { AuthTokenType } from "@prisma/client";
import type { CompanyKey, DepartmentId, UserAccess, UserStatus } from "@plugga/shared";

export interface AuthUserRecord {
  id: string;
  email: string;
  name: string;
  status: string;
  createdAt: Date;
  /**
   * Acesso como está gravado: papéis de plataforma + empresas com papéis e
   * departamentos. É a verdade do banco — a regra "admin alcança tudo" é
   * aplicada na leitura (`visibleCompanies`), nunca materializada aqui.
   */
  access: UserAccess;
}

/** A lista da equipe lê exatamente o mesmo registro; o nome existe pela leitura. */
export type TeamMemberRecord = AuthUserRecord;

export interface TeamFilter {
  companyId?: CompanyKey;
  departmentId?: DepartmentId;
  status?: UserStatus;
}

export interface CreateSessionData {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  absoluteExpiresAt: Date;
  ip?: string | null;
  userAgent?: string | null;
}

export interface CreateInvitedUserData {
  email: string;
  name: string;
  access: UserAccess;
}

export interface CreateAuthTokenData {
  userId: string;
  type: AuthTokenType;
  tokenHash: string;
  expiresAt: Date;
}

export interface ValidAuthToken {
  id: string;
  userId: string;
}

export interface SetPasswordOptions {
  activateUser: boolean;
  revokeSessions: boolean;
}

/**
 * Write/read side of the auth lifecycle (credentials, sessions, invite/reset
 * tokens, team administration). The narrow read used on every request lives in
 * the core SessionLookupRepository instead.
 */
export abstract class AuthRepository {
  abstract findUserByEmail(email: string): Promise<AuthUserRecord | null>;
  abstract findUserById(id: string): Promise<AuthUserRecord | null>;
  abstract findPasswordHash(userId: string): Promise<string | null>;
  abstract createSession(data: CreateSessionData): Promise<void>;
  abstract deleteSessionByTokenHash(tokenHash: string): Promise<void>;
  abstract deleteSessionsForUser(userId: string): Promise<void>;
  abstract createInvitedUser(data: CreateInvitedUserData): Promise<AuthUserRecord>;
  abstract createAuthToken(data: CreateAuthTokenData): Promise<void>;
  abstract findValidToken(
    tokenHash: string,
    type: AuthTokenType,
    now: Date,
  ): Promise<ValidAuthToken | null>;
  /**
   * Consumes a single-use token and sets the user's password in one
   * transaction. Throws if the token was already consumed (race guard).
   */
  abstract consumeTokenAndSetPassword(
    tokenId: string,
    userId: string,
    passwordHash: string,
    consumedAt: Date,
    options: SetPasswordOptions,
  ): Promise<void>;
  /** Substitui o acesso inteiro da pessoa. Conceder e revogar são a mesma escrita. */
  abstract replaceAccess(userId: string, access: UserAccess): Promise<AuthUserRecord | null>;
  abstract deactivateUser(userId: string): Promise<AuthUserRecord | null>;
  abstract listTeam(filter: TeamFilter): Promise<TeamMemberRecord[]>;
}
