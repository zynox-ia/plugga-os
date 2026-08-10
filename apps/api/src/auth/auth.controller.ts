import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle, Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { CookieOptions, Request, Response } from "express";
import {
  acceptInviteRequestSchema,
  googleCallbackSchema,
  loginRequestSchema,
  resetConfirmRequestSchema,
  resetRequestSchema,
  type AcceptInviteRequest,
  type AuthAcknowledgement,
  type GoogleCallback,
  type LoginRequest,
  type MeResponse,
  type ResetConfirmRequest,
  type ResetRequest,
  type SessionUser,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { SESSION_COOKIE_NAME } from "../core/auth/token.util";
import { AuthService } from "./auth.service";
import { GoogleAuthService } from "./google-auth.service";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";

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

  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) input: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: SessionUser }> {
    const { token, user } = await this.service.login(input, {
      ip: request.ip,
      userAgent: request.headers["user-agent"],
    });
    response.cookie(SESSION_COOKIE_NAME, token, this.cookieOptions());
    return { user };
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
  @Post("google")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  async google(
    @Body(new ZodValidationPipe(googleCallbackSchema)) input: GoogleCallback,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: SessionUser }> {
    const { token, user } = await this.googleAuth.login(
      {
        credential: input.credential,
        csrfFromBody: input.g_csrf_token,
        // Cookie NÃO assinado: quem o põe é o script do Google, não nós. A
        // proteção dele é ser um segredo que só a mesma aba conhece, e a
        // comparação com o corpo é o que a torna útil.
        csrfFromCookie: request.cookies?.[GOOGLE_CSRF_COOKIE] as string | undefined,
      },
      { ip: request.ip, userAgent: request.headers["user-agent"] },
    );
    response.cookie(SESSION_COOKIE_NAME, token, this.cookieOptions());
    return { user };
  }

  // Every navigation goes through the web app's session-gating middleware,
  // which calls this endpoint once per request. It's a cheap authenticated
  // read, not a brute-force target like login/invite/reset, so it's exempt
  // from the controller's default per-IP throttle (which would otherwise
  // falsely sign users out under normal traffic, e.g. behind a shared proxy IP).
  @Get("me")
  @SkipThrottle()
  @UseGuards(DevAuthGuard)
  me(@CurrentPrincipal() principal: AuthPrincipal): Promise<MeResponse> {
    return this.service.me(principal);
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(DevAuthGuard, OriginCheckGuard, ThrottlerGuard)
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

  @Post("accept-invite")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  acceptInvite(
    @Body(new ZodValidationPipe(acceptInviteRequestSchema)) input: AcceptInviteRequest,
  ): Promise<AuthAcknowledgement> {
    return this.service.acceptInvite(input);
  }

  @Post("reset/request")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  requestReset(
    @Body(new ZodValidationPipe(resetRequestSchema)) input: ResetRequest,
  ): Promise<AuthAcknowledgement> {
    return this.service.requestReset(input);
  }

  @Post("reset/confirm")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  confirmReset(
    @Body(new ZodValidationPipe(resetConfirmRequestSchema)) input: ResetConfirmRequest,
  ): Promise<AuthAcknowledgement> {
    return this.service.confirmReset(input);
  }

  private cookieOptions(): CookieOptions {
    const absoluteHours = this.config.get<number>("SESSION_ABSOLUTE_TTL_HOURS", 720);
    return {
      ...this.clearCookieOptions(),
      maxAge: absoluteHours * 3_600_000,
    };
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
