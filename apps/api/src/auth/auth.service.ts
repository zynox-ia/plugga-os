import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  authAcknowledgementSchema,
  eventNames,
  sessionUserSchema,
  userSummarySchema,
  type AcceptInviteRequest,
  type AssignRolesRequest,
  type AuthAcknowledgement,
  type InviteRequest,
  type LoginRequest,
  type ResetConfirmRequest,
  type ResetRequest,
  type SessionUser,
  type UserSummary,
} from "@plugga/shared";

import { AuditRepository } from "../audit/audit.repository";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { generateOpaqueToken, hashToken } from "../core/auth/token.util";
import { EmailPort } from "../email/email.port";
import { maskEmail } from "../email/email.util";
import { AuthRepository, type AuthUserRecord } from "./auth.repository";
import { EmailAttemptLimiter } from "./email-attempt-limiter.service";
import { LockoutService } from "./lockout.service";
import { PasswordService } from "./password.service";
import { SessionService, type SessionContext } from "./session.service";

const INVITE_TTL_MINUTES = 72 * 60;
const RESET_TTL_MINUTES = 60;

export interface LoginResult {
  token: string;
  user: SessionUser;
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
    @Inject(EmailPort) private readonly email: EmailPort,
    @Inject(AuditRepository) private readonly audit: AuditRepository,
    @Inject(ConfigService) private readonly config: ConfigService,
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

    // Both branches spend one Argon2id verify, so response time does not reveal
    // whether the account exists (the error body is already generic).
    const passwordValid = passwordHash
      ? await this.passwords.verify(passwordHash, input.password)
      : await this.passwords.verifyDummy(input.password);

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

    return { token, user: this.toSessionUser(user) };
  }

  async me(principal: AuthPrincipal): Promise<SessionUser> {
    const user = await this.repository.findUserById(principal.id);
    if (!user) {
      throw new UnauthorizedException("session user no longer exists");
    }
    return this.toSessionUser(user);
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

  async invite(input: InviteRequest, admin: AuthPrincipal): Promise<SessionUser> {
    const existing = await this.repository.findUserByEmail(input.email);
    if (existing) {
      throw new BadRequestException("a user with this email already exists");
    }

    const user = await this.repository.createInvitedUser({
      email: input.email,
      name: input.name,
      roleKeys: input.roles,
    });

    await this.issueTokenAndEmail(user, "invite", INVITE_TTL_MINUTES, "accept-invite");

    await this.audit.appendEvent({
      eventName: eventNames.authInviteCreated,
      entityType: "user",
      entityId: user.id,
      actorType: "user",
      actorId: admin.id,
      payload: { roles: input.roles },
      occurredAt: new Date(),
    });

    return this.toSessionUser(user);
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
        await this.issueTokenAndEmail(user, "reset", RESET_TTL_MINUTES, "reset");
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

  async listUsers(): Promise<UserSummary[]> {
    const users = await this.repository.listUsers();
    return users.map((user) =>
      userSummarySchema.parse({
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        roles: user.roles,
        createdAt: user.createdAt.toISOString(),
      }),
    );
  }

  async setRoles(userId: string, input: AssignRolesRequest, admin: AuthPrincipal): Promise<SessionUser> {
    const user = await this.repository.setUserRoles(userId, input.roles);
    if (!user) {
      throw new BadRequestException("user not found");
    }
    await this.audit.appendEvent({
      eventName: eventNames.userRolesUpdated,
      entityType: "user",
      entityId: userId,
      actorType: "user",
      actorId: admin.id,
      payload: { roles: input.roles },
      occurredAt: new Date(),
    });
    return this.toSessionUser(user);
  }

  async deactivate(userId: string, admin: AuthPrincipal): Promise<AuthAcknowledgement> {
    const user = await this.repository.deactivateUser(userId);
    if (!user) {
      throw new BadRequestException("user not found");
    }
    await this.sessions.revokeAllForUser(userId);
    await this.audit.appendEvent({
      eventName: eventNames.userDeactivated,
      entityType: "user",
      entityId: userId,
      actorType: "user",
      actorId: admin.id,
      payload: {},
      occurredAt: new Date(),
    });
    return this.ack();
  }

  private async issueTokenAndEmail(
    user: AuthUserRecord,
    type: "invite" | "reset",
    ttlMinutes: number,
    linkPath: string,
  ): Promise<void> {
    const rawToken = generateOpaqueToken();
    await this.repository.createAuthToken({
      userId: user.id,
      type,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
    });

    const baseUrl = this.config.get<string>("AUTH_APP_BASE_URL", "http://localhost:3000");
    await this.email.sendTransactional({
      to: user.email,
      template: type,
      variables: {
        name: user.name,
        link: `${baseUrl}/auth/${linkPath}?token=${rawToken}`,
        expiresInMinutes: ttlMinutes,
      },
    });
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

  private toSessionUser(user: AuthUserRecord): SessionUser {
    return sessionUserSchema.parse({
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      roles: user.roles,
    });
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
