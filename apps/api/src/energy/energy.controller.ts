import { Body, Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import {
  createAuditRequestSchema,
  createContestationRequestSchema,
  resolveAuditRequestSchema,
  updateContestationStatusRequestSchema,
  type AuditDetail,
  type ContestationDetail,
  type CreateAuditRequest,
  type CreateContestationRequest,
  type ListAuditsResponse,
  type ListConsumerUnitsResponse,
  type ListContestationsResponse,
  type ListCyclesResponse,
  type ListMarketMigrationsResponse,
  type ResolveAuditRequest,
  type UpdateContestationStatusRequest,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { EnergyService } from "./energy.service";
import { OPERATE_ENERGY, READ_ENERGY, RESOLVE_CONTESTATION } from "./energy.permissions";

@Controller("energy")
@UseGuards(DevAuthGuard, RolesGuard)
@Roles(...READ_ENERGY)
export class EnergyController {
  constructor(@Inject(EnergyService) private readonly service: EnergyService) {}

  @Get("consumer-units")
  listConsumerUnits(): Promise<ListConsumerUnitsResponse> {
    return this.service.listConsumerUnits();
  }

  @Get("market-migrations")
  listMarketMigrations(): Promise<ListMarketMigrationsResponse> {
    return this.service.listMarketMigrations();
  }

  @Get("cycles")
  listCycles(): Promise<ListCyclesResponse> {
    return this.service.listCycles();
  }

  @Get("audits")
  listAudits(): Promise<ListAuditsResponse> {
    return this.service.listAudits();
  }

  @Get("audits/:id")
  audit(@Param("id") id: string): Promise<AuditDetail> {
    return this.service.audit(id);
  }

  @Post("audits")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERATE_ENERGY)
  createAudit(
    @Body(new ZodValidationPipe(createAuditRequestSchema)) input: CreateAuditRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<AuditDetail> {
    return this.service.createAudit(input, principal);
  }

  @Post("audits/:id/resolve")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERATE_ENERGY)
  resolveAudit(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resolveAuditRequestSchema)) input: ResolveAuditRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<AuditDetail> {
    return this.service.resolveAudit(id, input, principal);
  }

  @Get("contestations")
  listContestations(): Promise<ListContestationsResponse> {
    return this.service.listContestations();
  }

  @Get("contestations/:id")
  contestation(@Param("id") id: string): Promise<ContestationDetail> {
    return this.service.contestation(id);
  }

  @Post("contestations")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERATE_ENERGY)
  createContestation(
    @Body(new ZodValidationPipe(createContestationRequestSchema)) input: CreateContestationRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ContestationDetail> {
    return this.service.createContestation(input, principal);
  }

  @Post("contestations/:id/status")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...RESOLVE_CONTESTATION)
  updateContestationStatus(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateContestationStatusRequestSchema)) input: UpdateContestationStatusRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ContestationDetail> {
    return this.service.updateContestationStatus(id, input, principal);
  }
}
