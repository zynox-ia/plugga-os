import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { evContactRequestSchema, evOptOutRequestSchema, incidentRequestSchema, resolveBlockerRequestSchema, type EvContactRequest, type EvOptOutRequest, type EvUserProfile, type IncidentRequest, type IncidentResponse, type PluggamobLocations, type PluggamobOverview, type PluggamobSessions, type ReactivationQueue, type ResolveBlockerRequest, type SettlementDetail, type Settlements } from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { PluggamobService } from "./pluggamob.service";

@Controller("pluggamob")
@UseGuards(DevAuthGuard, RolesGuard)
@Roles("pluggamob", "financeiro", "diretoria", "tech", "admin")
export class PluggamobController {
  constructor(@Inject(PluggamobService) private readonly service: PluggamobService) {}

  @Get("overview")
  overview(): Promise<PluggamobOverview> {
    return this.service.overview();
  }

  @Get("reactivation-queue")
  reactivationQueue(): Promise<ReactivationQueue> { return this.service.reactivationQueue(); }

  @Get("users/:id")
  userProfile(@Param("id", ParseUUIDPipe) id: string): Promise<EvUserProfile> { return this.service.userProfile(id); }

  @Post("users/:id/contacts")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles("pluggamob", "admin")
  recordContact(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(evContactRequestSchema)) input: EvContactRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<EvUserProfile> {
    return this.service.recordContact(id, input, principal);
  }

  @Post("users/:id/opt-out")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles("pluggamob", "admin")
  optOut(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(evOptOutRequestSchema)) input: EvOptOutRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<EvUserProfile> {
    return this.service.optOut(id, input, principal);
  }

  @Get("sessions") sessions(): Promise<PluggamobSessions> { return this.service.sessions(); }
  @Get("sessions/:id") session(@Param("id", ParseUUIDPipe) id: string): Promise<PluggamobSessions["items"][number]> { return this.service.session(id); }
  @Get("locations") locations(): Promise<PluggamobLocations> { return this.service.locations(); }
  @Get("locations/:id") location(@Param("id", ParseUUIDPipe) id: string): Promise<PluggamobLocations["items"][number]> { return this.service.location(id); }
  @Post("incidents") @HttpCode(201) @UseGuards(OriginCheckGuard) @Roles("pluggamob", "admin")
  createIncident(@Body(new ZodValidationPipe(incidentRequestSchema)) input: IncidentRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<IncidentResponse> { return this.service.createIncident(input, principal); }
  @Get("settlements") settlements(): Promise<Settlements> { return this.service.settlements(); }
  @Get("settlements/:id") settlement(@Param("id", ParseUUIDPipe) id: string): Promise<SettlementDetail> { return this.service.settlement(id); }
  @Post("settlements/:id/lines/:lineId/resolve-blocker") @HttpCode(200) @UseGuards(OriginCheckGuard) @Roles("financeiro", "admin")
  resolveBlocker(@Param("id", ParseUUIDPipe) id: string, @Param("lineId", ParseUUIDPipe) lineId: string, @Body(new ZodValidationPipe(resolveBlockerRequestSchema)) input: ResolveBlockerRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<SettlementDetail> { return this.service.resolveBlocker(id, lineId, input, principal); }
  @Post("settlements/:id/request-approval") @HttpCode(200) @UseGuards(OriginCheckGuard) @Roles("financeiro", "admin")
  requestApproval(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<SettlementDetail> { return this.service.requestApproval(id, principal); }
  @Post("settlements/:id/approve") @HttpCode(200) @UseGuards(OriginCheckGuard) @Roles("financeiro", "diretoria", "admin")
  approve(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<SettlementDetail> { return this.service.approve(id, principal); }
}
