import { Body, Controller, Get, Header, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, Res, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ThrottlerGuard } from "@nestjs/throttler";
import { REMEMBERED_SESSION_TTL_SECONDS, mfaCodeRequestSchema, mfaRemoveRequestSchema, type MfaCodeRequest, type MfaRemoveRequest } from "@plugga/shared";
import type { CookieOptions, Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Authenticated, Public } from "../core/auth/access.decorators";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { hashToken, SESSION_COOKIE_NAME } from "../core/auth/token.util";
import { MFA_PENDING_COOKIE, MfaService } from "./mfa.service";

@Controller("auth/mfa")
@UseGuards(OriginCheckGuard, ThrottlerGuard)
export class MfaController {
  constructor(@Inject(MfaService) private readonly service: MfaService, @Inject(ConfigService) private readonly config: ConfigService) {}

  @Public() @Get("challenge") @Header("Cache-Control", "no-store")
  challenge(@Req() req: Request) { return this.service.challenge(req.signedCookies?.[MFA_PENDING_COOKIE]); }

  @Public() @Post("verify") @HttpCode(200) @Header("Cache-Control", "no-store")
  async verify(@Body(new ZodValidationPipe(mfaCodeRequestSchema)) body: MfaCodeRequest, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.service.verify(req.signedCookies?.[MFA_PENDING_COOKIE], body.code, { ip: req.ip, userAgent: req.headers["user-agent"] });
    res.clearCookie(MFA_PENDING_COOKIE, this.cookie());
    res.cookie(SESSION_COOKIE_NAME, result.token, { ...this.cookie(), ...(result.rememberMe ? { maxAge: REMEMBERED_SESSION_TTL_SECONDS * 1000 } : {}) });
    return { user: result.user };
  }

  @Public() @Post("cancel") @HttpCode(200) @Header("Cache-Control", "no-store")
  async cancel(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.service.cancel(req.signedCookies?.[MFA_PENDING_COOKIE]);
    res.clearCookie(MFA_PENDING_COOKIE, this.cookie()); return result;
  }

  @Authenticated() @Get("status") @UseGuards(SessionAuthGuard) @Header("Cache-Control", "no-store")
  status(@CurrentPrincipal() principal: AuthPrincipal, @Req() req: Request) { return this.service.status(principal.id, this.session(principal, req)); }

  @Authenticated() @Post("setup") @HttpCode(200) @UseGuards(SessionAuthGuard) @Header("Cache-Control", "no-store")
  setup(@CurrentPrincipal() principal: AuthPrincipal, @Req() req: Request) { return this.service.setup(principal.id, this.session(principal, req)); }

  @Authenticated() @Post("enable") @HttpCode(200) @UseGuards(SessionAuthGuard) @Header("Cache-Control", "no-store")
  enable(@CurrentPrincipal() principal: AuthPrincipal, @Req() req: Request, @Body(new ZodValidationPipe(mfaCodeRequestSchema)) body: MfaCodeRequest) { return this.service.enable(principal.id, this.session(principal, req), body.code); }

  @Authenticated() @Post("confirm") @HttpCode(200) @UseGuards(SessionAuthGuard) @Header("Cache-Control", "no-store")
  confirm(@CurrentPrincipal() principal: AuthPrincipal, @Req() req: Request, @Body(new ZodValidationPipe(mfaCodeRequestSchema)) body: MfaCodeRequest) { return this.service.confirm(principal.id, this.session(principal, req), body.code); }

  @Authenticated() @Post("recovery-codes") @HttpCode(200) @UseGuards(SessionAuthGuard) @Header("Cache-Control", "no-store")
  recoveryCodes(@CurrentPrincipal() principal: AuthPrincipal, @Req() req: Request) { return this.service.recoveryCodes(principal.id, this.session(principal, req)); }

  @Authenticated() @Post("disable") @HttpCode(200) @UseGuards(SessionAuthGuard) @Header("Cache-Control", "no-store")
  disable(@CurrentPrincipal() principal: AuthPrincipal, @Req() req: Request) { return this.service.disable(principal.id, this.session(principal, req)); }

  @Authenticated() @Post("users/:id/remove") @HttpCode(200) @UseGuards(SessionAuthGuard) @Header("Cache-Control", "no-store")
  remove(@CurrentPrincipal() principal: AuthPrincipal, @Req() req: Request, @Param("id", new ParseUUIDPipe()) id: string, @Body(new ZodValidationPipe(mfaRemoveRequestSchema)) body: MfaRemoveRequest) { return this.service.remove(principal.id, this.session(principal, req), id, body.reason); }

  private session(principal: AuthPrincipal, req: Request): string {
    const raw = req.signedCookies?.[SESSION_COOKIE_NAME];
    if (principal.kind !== "user" || typeof raw !== "string" || !raw) throw new UnauthorizedException("Sessão de pessoa necessária.");
    return hashToken(raw);
  }
  private cookie(): CookieOptions {
    return { signed: true, httpOnly: true, sameSite: "lax", path: "/", secure: this.config.get<boolean>("AUTH_COOKIE_SECURE") ?? this.config.get<string>("NODE_ENV", "development") === "production" };
  }
}
