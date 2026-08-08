import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import {
  authAcknowledgementSchema,
  eventNames,
  flattenRoles,
  sessionUserSchema,
  type AcceptInviteRequest,
  type AuthAcknowledgement,
  type LoginRequest,
  type ResetConfirmRequest,
  type ResetRequest,
  type SessionUser,
} from "@plugga/shared";

import { AuditRepository } from "../audit/audit.repository";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { hashToken } from "../core/auth/token.util";
import { maskEmail } from "../email/email.util";
import { AuthTokenIssuer } from "./auth-token-issuer.service";
import { AuthRepository, type AuthUserRecord } from "./auth.repository";
import { EmailAttemptLimiter } from "./email-attempt-limiter.service";
import { LockoutService } from "./lockout.service";
import { PasswordService } from "./password.service";
import { SessionService, type SessionContext } from "./session.service";

export interface LoginResult {
  token: string;
  user: SessionUser;
}

/** Converte o registro do banco no usuário de sessão que web e API trocam. */
export function toSessionUser(user: AuthUserRecord): SessionUser {
  return sessionUserSchema.parse({
    id: user.id,
    email: user.email,
    name: user.name,
    status: user.status,
    roles: flattenRoles(user.access),
    access: user.access,
  });
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(LockoutService) private readonly lockout: LockoutService,
    @Inject(EmailAttemptLimiter) private readonly emailLimiter: EmailAttemptLimiter,
    @Inject(AuthTokenIssuer) private readonly tokens: AuthTokenIssuer,
    @Inject(AuditRepository) private readonly audit: AuditRepository,
  ) {}

  async login(input: LoginRequest, context: SessionContext): Promise<LoginResult> {
    const lockKey = `${input.email}:${context.ip ?? "unknown"}`;
    // The (email, IP) lock alone is bypassable by rotating X-Forwarded-For
    // (client-controlled); the email-only cap below stacks on top of it so
    // brute-forcing one account doesn't reset just by switching IPs.
    if (this.lockout.isLocked(lockKey) || this.emailLimiter.isBlocked(input.email)) {
      throw new UnauthorizedException("invalid credentials");
    }

    const user = await this.repository.findUserByEmail(input.email);
    const passwordHash = user ? await this.repository.findPasswordHash(user.id) : null;

    const passwordValid = passwordHash
      ? await this.passwords.verify(passwordHash, input.password)
      : false;

    if (!user || user.status !== "active" || !passwordValid) {
      this.lockout.recordFailure(lockKey);
      this.emailLimiter.recordFailure(input.email);
      await this.audit.appendEvent({
        eventName: eventNames.authLoginFailed,
        entityType: "auth",
        entityId: this.maskEmail(input.email),
        actorType: "system",
        actorId: null,
        payload: { reason: "invalid_credentials" },
        occurredAt: new Date(),
      });
      throw new UnauthorizedException("invalid credentials");
    }

    this.lockout.reset(lockKey);
    this.emailLimiter.reset(input.email);
    const token = await this.sessions.issue(user.id, context);
    await this.audit.appendEvent({
      eventName: eventNames.authLoginSucceeded,
      entityType: "user",
      entityId: user.id,
      actorType: "user",
      actorId: user.id,
      payload: {},
      occurredAt: new Date(),
    });

    return { token, user: toSessionUser(user) };
  }

  async me(principal: AuthPrincipal): Promise<SessionUser> {
    const user = await this.repository.findUserById(principal.id);
    if (!user) {
      throw new UnauthorizedException("session user no longer exists");
    }
    return toSessionUser(user);
  }

  async logout(rawToken: string | undefined, principal: AuthPrincipal): Promise<AuthAcknowledgement> {
    if (rawToken) {
      await this.sessions.revoke(rawToken);
    }
    await this.audit.appendEvent({
      eventName: eventNames.authLogout,
      entityType: "user",
      entityId: principal.id,
      actorType: "user",
      actorId: principal.id,
      payload: {},
      occurredAt: new Date(),
    });
    return this.ack();
  }

  async acceptInvite(input: AcceptInviteRequest): Promise<AuthAcknowledgement> {
    const token = await this.repository.findValidToken(hashToken(input.token), "invite", new Date());

    if (!token) {
      throw new BadRequestException("invalid or expired token");
    }

    const passwordHash = await this.passwords.hash(input.password);
    await this.consumeOrThrow(token.id, token.userId, passwordHash, {
      activateUser: true,
      revokeSessions: false,
    });

    await this.audit.appendEvent({
      eventName: eventNames.authInviteAccepted,
      entityType: "user",
      entityId: token.userId,
      actorType: "user",
      actorId: token.userId,
      payload: {},
      occurredAt: new Date(),
    });

    return this.ack();
  }

  async requestReset(input: ResetRequest): Promise<AuthAcknowledgement> {
    const user = await this.repository.findUserByEmail(input.email);

    // Only issue a token for an active account, but always answer generically
    // so the endpoint never reveals whether the account exists — including when
    // the email provider fails (ADR-0010 adapters can throw). Invite stays
    // fail-loud: it is admin-initiated and must surface delivery errors.
    if (user && user.status === "active") {
      try {
        await this.tokens.sendReset(user);
        await this.audit.appendEvent({
          eventName: eventNames.authResetRequested,
          entityType: "user",
          entityId: user.id,
          actorType: "system",
          actorId: null,
          payload: {},
          occurredAt: new Date(),
        });
      } catch {
        this.logger.warn(
          `reset email delivery failed: to=${maskEmail(user.email)}`,
        );
      }
    }

    return this.ack();
  }

  async confirmReset(input: ResetConfirmRequest): Promise<AuthAcknowledgement> {
    const token = await this.repository.findValidToken(hashToken(input.token), "reset", new Date());
    if (!token) {
      throw new BadRequestException("invalid or expired token");
    }

    const passwordHash = await this.passwords.hash(input.password);
    await this.consumeOrThrow(token.id, token.userId, passwordHash, {
      activateUser: false,
      revokeSessions: true,
    });

    await this.audit.appendEvent({
      eventName: eventNames.authResetCompleted,
      entityType: "user",
      entityId: token.userId,
      actorType: "user",
      actorId: token.userId,
      payload: {},
      occurredAt: new Date(),
    });

    return this.ack();
  }

  private async consumeOrThrow(
    tokenId: string,
    userId: string,
    passwordHash: string,
    options: { activateUser: boolean; revokeSessions: boolean },
  ): Promise<void> {
    try {
      await this.repository.consumeTokenAndSetPassword(
        tokenId,
        userId,
        passwordHash,
        new Date(),
        options,
      );
    } catch {
      throw new BadRequestException("invalid or expired token");
    }
  }

  private ack(): AuthAcknowledgement {
    return authAcknowledgementSchema.parse({ ok: true });
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split("@");
    if (!local || !domain) {
      return "***";
    }
    return `${local.slice(0, 1)}***@${domain}`;
  }
}
