import { timingSafeEqual } from "node:crypto";

import { HttpException, HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  eventNames,
  normalizeEmail,
  type GoogleLoginErrorCode,
} from "@plugga/shared";

import { AuditRepository } from "../audit/audit.repository";
import { maskEmail } from "../email/email.util";
import { AuthRepository, IdentityLinkError, type AuthUserRecord } from "./auth.repository";
import { toSessionUser, type LoginResult } from "./auth.service";
import {
  GoogleIdentityVerifier,
  GoogleVerificationError,
  type GoogleIdentityClaims,
} from "./google-identity.verifier";
import { SessionService, type SessionContext } from "./session.service";

const PROVIDER = "google" as const;

/**
 * Domínios em que o Google continua sendo autoridade sobre a caixa postal. Uma
 * conta Google criada a partir de um e-mail de terceiro traz
 * `email_verified=true` para sempre, mesmo que a pessoa tenha perdido aquele
 * e-mail anos atrás — o próprio Google alerta para isso. Como o primeiro
 * vínculo casa a conta Google com um usuário local PELO E-MAIL, aceitar essa
 * prova antiga seria aceitar que quem controla o e-mail hoje é quem o provou
 * um dia. Nesses casos a pessoa entra por senha, e só.
 */
const AUTHORITATIVE_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Motivo interno da recusa. Vai para a auditoria e para lugar nenhum além dela:
 * dizer ao browser QUAL das recusas aconteceu é o mesmo oráculo de existência
 * de conta que o login por senha evita respondendo sempre a mesma coisa.
 */
export type GoogleLoginRefusal =
  | "feature_disabled"
  | "invalid_csrf"
  | "invalid_token"
  | "email_not_verified"
  | "email_not_authoritative"
  | "user_not_found"
  | "user_not_eligible"
  | "identity_conflict"
  | "identity_email_conflict"
  | "verifier_unavailable";

export interface GoogleLoginInput {
  credential: string;
  /** `g_csrf_token` do corpo do formulário postado pelo Google. */
  csrfFromBody: string;
  /** `g_csrf_token` do cookie de mesmo nome, posto pelo GIS no nosso domínio. */
  csrfFromCookie: string | undefined;
}

/**
 * Exceção com o código público anexado. O corpo tem `code` porque o app web
 * traduz código em mensagem — mapear pelo status HTTP sozinho confundiria 401
 * de token inválido com 401 de conta desativada no dia em que um deles mudasse.
 */
export class GoogleLoginException extends HttpException {
  constructor(code: GoogleLoginErrorCode, status: HttpStatus) {
    super({ statusCode: status, message: "google login refused", code }, status);
  }
}

/** Comparação de tamanho e conteúdo sem vazar o ponto da divergência no tempo. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length || left.length === 0) {
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * Login federado com o Google (adendo ao ADR-0008).
 *
 * O Google prova QUEM é a pessoa. Quem decide se ela entra continua sendo o
 * Postgres do cliente: usuário, status, empresas, departamentos, papéis e
 * sessão. Por isso este serviço termina chamando o MESMO `SessionService.issue`
 * do login por senha — não existe uma segunda sessão, nem um segundo cookie,
 * nem um segundo lugar de onde revogar acesso.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(GoogleIdentityVerifier) private readonly verifier: GoogleIdentityVerifier,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditRepository) private readonly audit: AuditRepository,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  get enabled(): boolean {
    return this.config.get<boolean>("GOOGLE_AUTH_ENABLED", false) === true;
  }

  async login(input: GoogleLoginInput, context: SessionContext): Promise<LoginResult> {
    if (!this.enabled) {
      // Desligado é desligado inclusive para quem chama a rota direto: a flag é
      // o rollback do recurso, e um rollback que só esconde o botão não é um.
      await this.refuse("feature_disabled", null);
      throw new GoogleLoginException("disabled", HttpStatus.FORBIDDEN);
    }

    // CSRF antes de qualquer coisa cara: um POST forjado não pode custar uma
    // verificação de assinatura nem uma ida ao JWKS do Google.
    if (!input.csrfFromCookie || !constantTimeEquals(input.csrfFromCookie, input.csrfFromBody)) {
      await this.refuse("invalid_csrf", null);
      throw new GoogleLoginException("unauthorized", HttpStatus.UNAUTHORIZED);
    }

    const claims = await this.verifyOrRefuse(input.credential);

    if (!claims.emailVerified) {
      await this.refuse("email_not_verified", claims.email);
      throw new GoogleLoginException("unauthorized", HttpStatus.UNAUTHORIZED);
    }

    const email = normalizeEmail(claims.email);
    const identity = await this.repository.findIdentityBySubject(PROVIDER, claims.subject);

    const user = identity
      ? await this.loginWithExistingIdentity(identity.id, identity.userId, email, claims)
      : await this.linkFirstTime(email, claims);

    const token = await this.sessions.issue(user, context);
    await this.audit.appendEvent({
      eventName: eventNames.authLoginSucceeded,
      entityType: "user",
      entityId: user.id,
      actorType: "user",
      actorId: user.id,
      payload: { method: PROVIDER },
      occurredAt: new Date(),
    });

    return { token, user: toSessionUser(user) };
  }

  /** Logins seguintes: a busca é por `sub`; o e-mail pode ter mudado no meio. */
  private async loginWithExistingIdentity(
    identityId: string,
    userId: string,
    email: string,
    claims: GoogleIdentityClaims,
  ): Promise<AuthUserRecord> {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      await this.refuse("user_not_found", email);
      throw new GoogleLoginException("unauthorized", HttpStatus.UNAUTHORIZED);
    }
    // O status local vence a validade do token: desativar alguém tem de
    // fechar TODOS os caminhos de entrada, não só o da senha.
    if (user.status !== "active") {
      await this.refuse("user_not_eligible", email, user.id);
      throw new GoogleLoginException("unauthorized", HttpStatus.UNAUTHORIZED);
    }

    // O e-mail da conta Google mudou e agora é o de OUTRA pessoa do sistema.
    // A identidade continua sendo a mesma (`sub` não mudou), mas seguir em
    // frente calado deixaria duas pessoas apontando para o mesmo e-mail sem
    // ninguém notar. Recusa e registra para alguém olhar.
    if (email !== normalizeEmail(user.email)) {
      const homonimo = await this.repository.findUserByEmail(email);
      if (homonimo && homonimo.id !== user.id) {
        await this.refuse("identity_email_conflict", email, user.id);
        throw new GoogleLoginException("unauthorized", HttpStatus.UNAUTHORIZED);
      }
    }

    await this.repository.recordIdentityLogin(identityId, email, claims.hostedDomain, new Date());
    return user;
  }

  /** Primeiro vínculo: é a única etapa em que o e-mail decide alguma coisa. */
  private async linkFirstTime(
    email: string,
    claims: GoogleIdentityClaims,
  ): Promise<AuthUserRecord> {
    if (!this.isAuthoritativeEmail(email, claims.hostedDomain)) {
      await this.refuse("email_not_authoritative", email);
      throw new GoogleLoginException("unauthorized", HttpStatus.UNAUTHORIZED);
    }

    const user = await this.repository.findUserByEmail(email);
    // Não há autocadastro: conta no plugga-os nasce de convite, e uma conta
    // Google válida não é permissão para existir aqui dentro.
    if (!user) {
      await this.refuse("user_not_found", email);
      throw new GoogleLoginException("unauthorized", HttpStatus.UNAUTHORIZED);
    }
    if (user.status !== "active" && user.status !== "invited") {
      await this.refuse("user_not_eligible", email, user.id);
      throw new GoogleLoginException("unauthorized", HttpStatus.UNAUTHORIZED);
    }

    const eraConvidado = user.status === "invited";
    let vinculado: AuthUserRecord;
    try {
      vinculado = await this.repository.linkIdentity({
        userId: user.id,
        provider: PROVIDER,
        subject: claims.subject,
        email,
        hostedDomain: claims.hostedDomain,
        now: new Date(),
      });
    } catch (error) {
      if (error instanceof IdentityLinkError) {
        const motivo = error.reason === "conflict" ? "identity_conflict" : error.reason;
        await this.refuse(motivo, email, user.id);
        throw new GoogleLoginException("unauthorized", HttpStatus.UNAUTHORIZED);
      }
      throw error;
    }

    await this.audit.appendEvent({
      eventName: eventNames.authGoogleIdentityLinked,
      entityType: "user",
      entityId: vinculado.id,
      actorType: "user",
      actorId: vinculado.id,
      payload: { provider: PROVIDER, activatedInvite: eraConvidado },
      occurredAt: new Date(),
    });

    if (eraConvidado) {
      // Mesmo evento do aceite por token: para quem lê a trilha da equipe, o
      // que aconteceu é "o convite virou conta ativa" — o método é detalhe.
      await this.audit.appendEvent({
        eventName: eventNames.authInviteAccepted,
        entityType: "user",
        entityId: vinculado.id,
        actorType: "user",
        actorId: vinculado.id,
        payload: { method: PROVIDER },
        occurredAt: new Date(),
      });
    }

    return vinculado;
  }

  private async verifyOrRefuse(credential: string): Promise<GoogleIdentityClaims> {
    try {
      return await this.verifier.verify(credential);
    } catch (error) {
      if (error instanceof GoogleVerificationError && error.kind === "unavailable") {
        await this.refuse("verifier_unavailable", null);
        // Falha fechada e TEMPORÁRIA: o Google fora do ar não pode virar "conta
        // não autorizada", e o login por senha continua funcionando ao lado.
        throw new GoogleLoginException("unavailable", HttpStatus.SERVICE_UNAVAILABLE);
      }
      await this.refuse("invalid_token", null);
      throw new GoogleLoginException("unauthorized", HttpStatus.UNAUTHORIZED);
    }
  }

  private isAuthoritativeEmail(email: string, hostedDomain: string | null): boolean {
    if (hostedDomain) {
      return true;
    }
    const domain = email.split("@")[1] ?? "";
    return AUTHORITATIVE_DOMAINS.has(domain);
  }

  /**
   * Uma recusa, um registro. `entityId` é o id local quando ele foi resolvido; só
   * quando não houve usuário nenhum é que o e-mail aparece — e mascarado. O ID
   * token e o `sub` não entram aqui em hipótese alguma: a auditoria é
   * append-only e guardaria para sempre uma credencial e um identificador
   * externo que nenhuma tela precisa.
   */
  private async refuse(
    reason: GoogleLoginRefusal,
    email: string | null,
    userId?: string,
  ): Promise<void> {
    this.logger.warn(`google login refused: reason=${reason}`);
    await this.audit.appendEvent({
      eventName: eventNames.authLoginFailed,
      entityType: userId ? "user" : "auth",
      entityId: userId ?? (email ? maskEmail(email) : "unknown"),
      actorType: "system",
      actorId: null,
      payload: { method: PROVIDER, reason },
      occurredAt: new Date(),
    });
  }
}
