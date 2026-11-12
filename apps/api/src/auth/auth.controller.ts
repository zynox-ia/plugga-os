import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle, Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { CookieOptions, Request, Response } from "express";
import {
  acceptInviteRequestSchema,
  changePasswordRequestSchema,
  googleCallbackSchema,
  loginRequestSchema,
  REMEMBERED_SESSION_TTL_SECONDS,
  resetConfirmRequestSchema,
  resetRequestSchema,
  type AcceptInviteRequest,
  type AuthAcknowledgement,
  type ChangePasswordRequest,
  type GoogleCallback,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
  type ResetConfirmRequest,
  type ResetRequest,
} from "@plugga/shared";

import { Authenticated, Public } from "../core/auth/access.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { SESSION_COOKIE_NAME } from "../core/auth/token.util";
import { AuthService } from "./auth.service";
import { GoogleAuthService } from "./google-auth.service";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { MFA_PENDING_COOKIE, MFA_WINDOW_MS, type MfaLoginResult } from "./mfa.service";

/** Teto de proteção do servidor (não é limite de tentativas): ver `login`. */
const LIMITE_LOGIN_POR_MINUTO_E_ORIGEM = 120;

/** Nome fixo do cookie double-submit posto pelo Google Identity Services. */
const GOOGLE_CSRF_COOKIE = "g_csrf_token";

// ThrottlerGuard is applied per-route (not at the controller level) so it
// always runs *after* OriginCheckGuard: a rejected cross-origin request must
// not consume a slot in the rate-limit bucket.
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly service: AuthService,
    @Inject(GoogleAuthService) private readonly googleAuth: GoogleAuthService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /**
   * O login NÃO tem mais o teto de 10 por minuto por IP: ele recusava também
   * quem informava a senha certa (30 tentativas de qualquer um, vindas do mesmo
   * IP, trancavam a vítima fora — US11, SC-013). Quem erra agora é ATRASADO,
   * por conta e por origem, e quem acerta nunca espera (`LimitadorLogin`). O
   * teto abaixo é só proteção do servidor contra inundação (cada requisição
   * custa um hash argon2), muito acima de qualquer uso real, por origem.
   */
  @Public()
  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: LIMITE_LOGIN_POR_MINUTO_E_ORIGEM, ttl: 60_000 } })
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) input: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.service.login(input, {
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    });
    return this.loginResponse(result, response, input.rememberMe ?? false);
  }

  /**
   * Login federado com o Google (adendo ao ADR-0008). O corpo é
   * `application/x-www-form-urlencoded` porque quem o envia é o próprio Google,
   * por POST de formulário no modo redirect do GIS — não é o nosso browser
   * fazendo `fetch`, e por isso o JSON dos demais endpoints não serve aqui.
   *
   * O teto é o mesmo do login por senha: 10 tentativas por minuto por IP. O
   * limitador por e-mail NÃO entra antes da verificação — as claims ainda não
   * foram provadas neste ponto, e deixar entrada de atacante escolher qual
   * conta bloquear transformaria a proteção numa negação de serviço dirigida.
   */
  @Public()
  @Post("google")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async google(
    @Body(new ZodValidationPipe(googleCallbackSchema)) input: GoogleCallback,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    const result = await this.googleAuth.login(
      {
        credential: input.credential,
        csrfFromBody: input.g_csrf_token,
        // Cookie NÃO assinado: quem o põe é o script do Google, não nós. A
        // proteção dele é ser um segredo que só a mesma aba conhece, e a
        // comparação com o corpo é o que a torna útil.
        csrfFromCookie: request.cookies?.[GOOGLE_CSRF_COOKIE] as string | undefined,
      },
      { ip: request.ip, userAgent: request.headers["user-agent"], rememberMe: input.state === "remember" },
    );
    return this.loginResponse(result, response, input.state === "remember");
  }

  // Every navigation goes through the web app's session-gating middleware,
  // which calls this endpoint once per request. It's a cheap authenticated
  // read, not a brute-force target like login/invite/reset, so it's exempt
  // from the controller's default per-IP throttle (which would otherwise
  // falsely sign users out under normal traffic, e.g. behind a shared proxy IP).
  @Authenticated()
  @Get("me")
  @SkipThrottle()
  @UseGuards(SessionAuthGuard)
  me(
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MeResponse> {
    return this.service.me(principal);
  }

  @Authenticated()
  @Post("logout")
  @HttpCode(200)
  @UseGuards(SessionAuthGuard, OriginCheckGuard, ThrottlerGuard)
  async logout(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthAcknowledgement> {
    const rawToken = request.signedCookies?.[SESSION_COOKIE_NAME] as string | undefined;
    const result = await this.service.logout(rawToken, principal);
    response.clearCookie(SESSION_COOKIE_NAME, this.clearCookieOptions());
    return result;
  }

  @Authenticated()
  @Post("password")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(SessionAuthGuard, OriginCheckGuard, ThrottlerGuard)
  changePassword(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Req() request: Request,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) input: ChangePasswordRequest,
  ): Promise<AuthAcknowledgement> {
    const rawToken = request.signedCookies?.[SESSION_COOKIE_NAME] as string | undefined;
    return this.service.changePassword(principal, rawToken, input, { ip: request.ip });
  }

  @Public()
  @Post("accept-invite")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  acceptInvite(
    @Body(new ZodValidationPipe(acceptInviteRequestSchema)) input: AcceptInviteRequest,
  ): Promise<AuthAcknowledgement> {
    return this.service.acceptInvite(input);
  }

  @Public()
  @Post("reset/request")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  requestReset(
    @Body(new ZodValidationPipe(resetRequestSchema)) input: ResetRequest,
  ): Promise<AuthAcknowledgement> {
    return this.service.requestReset(input);
  }

  @Public()
  @Post("reset/confirm")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  confirmReset(
    @Body(new ZodValidationPipe(resetConfirmRequestSchema)) input: ResetConfirmRequest,
  ): Promise<AuthAcknowledgement> {
    return this.service.confirmReset(input);
  }

  private cookieOptions(rememberMe: boolean): CookieOptions {
    return {
      ...this.clearCookieOptions(),
      ...(rememberMe ? { maxAge: REMEMBERED_SESSION_TTL_SECONDS * 1_000 } : {}),
    };
  }

  private loginResponse(result: MfaLoginResult, response: Response, rememberMe: boolean): LoginResponse {
    response.setHeader("Cache-Control", "no-store");
    if ("requiresMfa" in result) {
      response.cookie(MFA_PENDING_COOKIE, result.pendingToken, { ...this.clearCookieOptions(), maxAge: MFA_WINDOW_MS });
      response.clearCookie(SESSION_COOKIE_NAME, this.clearCookieOptions());
      return { requiresMfa: true };
    }
    response.cookie(SESSION_COOKIE_NAME, result.token, this.cookieOptions(rememberMe));
    response.clearCookie(MFA_PENDING_COOKIE, this.clearCookieOptions());
    return { user: result.user };
  }

  private clearCookieOptions(): CookieOptions {
    const override = this.config.get<boolean>("AUTH_COOKIE_SECURE");
    const nodeEnv = this.config.get<string>("NODE_ENV", "development");
    const secure = override ?? nodeEnv === "production";
    return {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
    };
  }
}
