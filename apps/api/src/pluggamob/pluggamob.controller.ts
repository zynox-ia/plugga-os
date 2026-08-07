import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import {
  resolveSettlementBlockerRequestSchema,
  settlementDecisionRequestSchema,
  type CouponsResponse,
  type D14CreditsResponse,
  type PluggamobOverview,
  type ResolveSettlementBlockerRequest,
  type SettlementDecisionRequest,
  type SettlementDetail,
  type SettlementsResponse,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { PluggamobService } from "./pluggamob.service";
import { SettlementsService } from "./settlements/settlements.service";

@Controller("pluggamob")
@UseGuards(DevAuthGuard, RolesGuard)
@Roles("pluggamob", "financeiro", "diretoria", "tech", "admin")
export class PluggamobController {
  constructor(
    @Inject(PluggamobService) private readonly service: PluggamobService,
    @Inject(SettlementsService) private readonly settlementsService: SettlementsService,
  ) {}

  @Get("overview")
  overview(): Promise<PluggamobOverview> {
    return this.service.overview();
  }

  @Get("coupons")
  coupons(): Promise<CouponsResponse> {
    return this.settlementsService.coupons();
  }

  @Get("settlements")
  settlements(): Promise<SettlementsResponse> {
    return this.settlementsService.settlements();
  }

  @Get("settlements/:id")
  settlement(@Param("id", ParseUUIDPipe) id: string): Promise<SettlementDetail> {
    return this.settlementsService.settlement(id);
  }

  @Get("d14-credits")
  d14Credits(): Promise<D14CreditsResponse> {
    return this.settlementsService.d14Credits();
  }

  @Post("settlements/:id/resolve-blocker")
  @UseGuards(OriginCheckGuard)
  @Roles("financeiro", "admin")
  resolveBlocker(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolveSettlementBlockerRequestSchema)) input: ResolveSettlementBlockerRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<SettlementDetail> {
    return this.settlementsService.resolveBlocker(id, input, principal);
  }

  @Post("settlements/:id/request-approval")
  @UseGuards(OriginCheckGuard)
  @Roles("pluggamob", "financeiro", "admin")
  requestApproval(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(settlementDecisionRequestSchema)) input: SettlementDecisionRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<SettlementDetail> {
    return this.settlementsService.requestApproval(id, input, principal);
  }

  @Post("settlements/:id/approve")
  @UseGuards(OriginCheckGuard)
  @Roles("financeiro", "diretoria")
  approve(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(settlementDecisionRequestSchema)) input: SettlementDecisionRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<SettlementDetail> {
    return this.settlementsService.approve(id, input, principal);
  }
}
