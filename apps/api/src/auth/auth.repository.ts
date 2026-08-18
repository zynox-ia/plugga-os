import type { AuthTokenType } from "@prisma/client";
import type {
  CompanyKey,
  DepartmentId,
  IdentityProvider,
  UserAccess,
  UserStatus,
} from "@plugga/shared";

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

/** Vínculo já existente entre um usuário local e uma conta de provedor federado. */
export interface UserIdentityRecord {
  id: string;
  userId: string;
  provider: IdentityProvider;
  subject: string;
  emailAtLink: string;
  lastObservedEmail: string;
  hostedDomain: string | null;
}

export interface LinkIdentityData {
  userId: string;
  provider: IdentityProvider;
  subject: string;
  /** E-mail normalizado observado no momento do vínculo. */
  email: string;
  hostedDomain: string | null;
  now: Date;
}

/**
 * Por que a corrida existe: dois primeiros logins simultâneos passam os dois
 * pela mesma verificação e chegam os dois na escrita. Quem decide é a constraint
 * única, não a checagem — e o perdedor precisa virar recusa controlada, não 500.
 * `reason` só alimenta a auditoria interna; para quem tentou entrar, todos os
 * motivos são a mesma mensagem genérica.
 */
export type IdentityLinkFailure = "conflict" | "user_not_found" | "user_not_eligible";

export class IdentityLinkError extends Error {
  constructor(readonly reason: IdentityLinkFailure) {
    super(`identity link refused: ${reason}`);
    this.name = "IdentityLinkError";
  }
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
  /** Replaces every pending token of the same type for the same user atomically. */
  abstract replaceAuthToken(data: CreateAuthTokenData): Promise<void>;
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
  /** Vínculo federado pelo par (provedor, subject) — nunca pelo e-mail. */
  abstract findIdentityBySubject(
    provider: IdentityProvider,
    subject: string,
  ): Promise<UserIdentityRecord | null>;
  /**
   * Cria o vínculo e, se a pessoa ainda estava `invited`, ativa a conta e
   * consome os convites pendentes — tudo em UMA transação. Separar as duas
   * coisas deixaria a janela em que a conta já está ativa mas sem vínculo (ou o
   * inverso), e o convite antigo continuaria sendo uma porta aberta.
   * Lança `IdentityLinkError` em qualquer recusa; nunca sobe erro de driver.
   */
  abstract linkIdentity(data: LinkIdentityData): Promise<AuthUserRecord>;
  /** Metadados observados no login seguinte. Não altera `users.email`/`name`. */
  abstract recordIdentityLogin(
    identityId: string,
    email: string,
    hostedDomain: string | null,
    now: Date,
  ): Promise<void>;
  /** Substitui o acesso inteiro da pessoa. Conceder e revogar são a mesma escrita. */
  abstract replaceAccess(userId: string, access: UserAccess): Promise<AuthUserRecord | null>;
  abstract deactivateUser(userId: string): Promise<AuthUserRecord | null>;
  abstract listTeam(filter: TeamFilter): Promise<TeamMemberRecord[]>;
}
