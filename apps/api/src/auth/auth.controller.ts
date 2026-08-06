import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { CookieOptions, Request, Response } from "express";
import {
  acceptInviteRequestSchema,
  assignRolesRequestSchema,
  inviteRequestSchema,
  loginRequestSchema,
  resetConfirmRequestSchema,
  resetRequestSchema,
  type AcceptInviteRequest,
  type AssignRolesRequest,
  type AuthAcknowledgement,
  type InviteRequest,
  type LoginRequest,
  type MeResponse,
  type ResetConfirmRequest,
  type ResetRequest,
  type SessionUser,
  type UserSummary,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { SESSION_COOKIE_NAME } from "../core/auth/token.util";
import { AuthService } from "./auth.service";
import { OriginCheckGuard } from "./origin-check.guard";

@Controller("auth")
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly service: AuthService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(OriginCheckGuard)
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

  @Get("me")
  @UseGuards(DevAuthGuard)
  me(@CurrentPrincipal() principal: AuthPrincipal): Promise<MeResponse> {
    return this.service.me(principal);
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(DevAuthGuard, OriginCheckGuard)
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
  @UseGuards(OriginCheckGuard)
  acceptInvite(
    @Body(new ZodValidationPipe(acceptInviteRequestSchema)) input: AcceptInviteRequest,
  ): Promise<AuthAcknowledgement> {
    return this.service.acceptInvite(input);
  }

  @Post("reset/request")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(OriginCheckGuard)
  requestReset(
    @Body(new ZodValidationPipe(resetRequestSchema)) input: ResetRequest,
  ): Promise<AuthAcknowledgement> {
    return this.service.requestReset(input);
  }

  @Post("reset/confirm")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(OriginCheckGuard)
  confirmReset(
    @Body(new ZodValidationPipe(resetConfirmRequestSchema)) input: ResetConfirmRequest,
  ): Promise<AuthAcknowledgement> {
    return this.service.confirmReset(input);
  }

  @Post("invite")
  @UseGuards(DevAuthGuard, RolesGuard, OriginCheckGuard)
  @Roles("admin")
  invite(
    @Body(new ZodValidationPipe(inviteRequestSchema)) input: InviteRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<SessionUser> {
    return this.service.invite(input, principal);
  }

  @Get("users")
  @UseGuards(DevAuthGuard, RolesGuard)
  @Roles("admin")
  listUsers(): Promise<UserSummary[]> {
    return this.service.listUsers();
  }

  @Put("users/:id/roles")
  @HttpCode(200)
  @UseGuards(DevAuthGuard, RolesGuard, OriginCheckGuard)
  @Roles("admin")
  setRoles(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignRolesRequestSchema)) input: AssignRolesRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<SessionUser> {
    return this.service.setRoles(id, input, principal);
  }

  @Post("users/:id/deactivate")
  @HttpCode(200)
  @UseGuards(DevAuthGuard, RolesGuard, OriginCheckGuard)
  @Roles("admin")
  deactivate(
    @Param("id") id: string,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<AuthAcknowledgement> {
    return this.service.deactivate(id, principal);
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
