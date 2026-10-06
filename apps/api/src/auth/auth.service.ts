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

import { AuditPort } from "../audit/audit.port";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { SessionCache, type ResolvedSessionUser } from "../core/auth/session-cache";
import { hashToken } from "../core/auth/token.util";
import { maskEmail } from "../common/mascara-email";
import { AuthRepository } from "./auth.repository";
import { LimitadorLogin } from "./limitador/limitador-login.service";
import { PasswordService } from "./password.service";
import { ResetEmailDispatcher } from "./reset-email.dispatcher";
import { SessionService, type SessionContext } from "./session.service";

export interface LoginResult {
  token: string;
  user: SessionUser;
}

/** Converte o registro do banco (ou o cache) no usuário de sessão que web e API trocam. */
export function toSessionUser(user: ResolvedSessionUser): SessionUser {
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
    @Inject(LimitadorLogin) private readonly limitador: LimitadorLogin,
    @Inject(ResetEmailDispatcher) private readonly resetEmail: ResetEmailDispatcher,
    @Inject(AuditPort) private readonly audit: AuditPort,
    @Inject(SessionCache) private readonly cache: SessionCache,
  ) {}

  async login(input: LoginRequest, context: SessionContext): Promise<LoginResult> {
    // Nenhuma conta ou origem é BLOQUEADA antes de a senha ser verificada (US11,
    // T112, SC-013): quem erra é atrasado depois, quem acerta nunca espera.
    // 30 erros contra a conta A não impedem a conta B, nem a própria A com a
    // senha certa. Ver `LimitadorLogin`.
    const user = await this.repository.findUserByEmail(input.email);
    const passwordHash = user ? await this.repository.findPasswordHash(user.id) : null;

    let passwordValid = false;
    if (passwordHash) {
      passwordValid = await this.passwords.verify(passwordHash, input.password);
    } else {
      // Resposta e auditoria já são genéricas; o TEMPO também precisa ser.
      await this.passwords.verifyAgainstDummy(input.password);
    }

    if (!user || user.status !== "active" || !passwordValid) {
      await this.audit.appendEvent({
        eventName: eventNames.authLoginFailed,
        entityType: "auth",
        entityId: maskEmail(input.email),
        actorType: "system",
        actorId: null,
        payload: { reason: "invalid_credentials" },
        occurredAt: new Date(),
      });
      // Atraso progressivo por conta e por origem, só para quem errou. É
      // idêntico para conta existente e inexistente (nada vira oráculo).
      await this.limitador.penalizar(input.email, context.ip);
      throw new UnauthorizedException("invalid credentials");
    }

    await this.limitador.registrarSucesso(input.email);
    const token = await this.sessions.issue(user, context);
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

  /**
   * `rawToken` é opcional porque o caminho de dev-header (`DEV_AUTH_ENABLED`)
   * autentica sem cookie de sessão — sem token não há o que cachear, e cai
   * direto no Postgres como sempre foi.
   */
  async me(principal: AuthPrincipal, rawToken?: string): Promise<SessionUser> {
    const cached = rawToken ? await this.cache.get(hashToken(rawToken)) : null;
    const user = cached?.user ?? (await this.repository.findUserById(principal.id));
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

  /**
   * Resposta e TEMPO idênticos para conta existente, inexistente ou desativada
   * (US11, T117, FR-051): a requisição não consulta o
   * banco nem fala com o provedor de e-mail, só entrega o pedido ao
   * `ResetEmailDispatcher` (fila BullMQ). Quem procura a conta, emite o token,
   * envia e audita é o `ResetEmailHandler`, depois que a resposta já saiu —
   * inclusive quando o provedor falha (ADR-0010 adapters can throw). Convite
   * segue falhando alto: é iniciado por um admin e precisa mostrar erro de envio.
   */
  async requestReset(input: ResetRequest): Promise<AuthAcknowledgement> {
    await this.resetEmail.solicitar(input.email);
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

    // A transação acima já apagou as sessões do Postgres, mas a entrada no cache
    // de sessão (Redis, até SESSION_CACHE_TTL_SECONDS) continuaria valendo e a
    // sessão antiga seguiria entrando até expirar. `revokeAllForUser` também
    // invalida o cache: a sessão antiga é recusada na hora (US11, T114, SC-014).
    await this.sessions.revokeAllForUser(token.userId);

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
}
