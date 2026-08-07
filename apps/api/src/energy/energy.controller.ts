import { Body, Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import {
  activateMarketMigrationRequestSchema,
  advanceMarketMigrationStageRequestSchema,
  cancelMarketMigrationRequestSchema,
  createMarketMigrationRequestSchema,
  type ActivateMarketMigrationRequest,
  type AdvanceMarketMigrationStageRequest,
  type CancelMarketMigrationRequest,
  type CreateMarketMigrationRequest,
  type ListAuditsResponse,
  type ListConsumerUnitsResponse,
  type ListContestationsResponse,
  type ListCyclesResponse,
  type ListMarketMigrationsResponse,
  type MarketMigrationDetail,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { EnergyService } from "./energy.service";
import { OPERATE_ENERGY, READ_ENERGY } from "./energy.permissions";

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

  @Post("market-migrations")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERATE_ENERGY)
  createMarketMigration(
    @Body(new ZodValidationPipe(createMarketMigrationRequestSchema)) input: CreateMarketMigrationRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    return this.service.createMarketMigration(input, principal);
  }

  @Post("market-migrations/:id/stage")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERATE_ENERGY)
  advanceMarketMigrationStage(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(advanceMarketMigrationStageRequestSchema)) input: AdvanceMarketMigrationStageRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    return this.service.advanceMarketMigrationStage(id, input, principal);
  }

  @Post("market-migrations/:id/cancel")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERATE_ENERGY)
  cancelMarketMigration(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cancelMarketMigrationRequestSchema)) input: CancelMarketMigrationRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    return this.service.cancelMarketMigration(id, input, principal);
  }

  @Post("market-migrations/:id/activate")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERATE_ENERGY)
  activateMarketMigration(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(activateMarketMigrationRequestSchema)) input: ActivateMarketMigrationRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    return this.service.activateMarketMigration(id, input, principal);
  }

  @Get("cycles")
  listCycles(): Promise<ListCyclesResponse> {
    return this.service.listCycles();
  }

  @Get("audits")
  listAudits(): Promise<ListAuditsResponse> {
    return this.service.listAudits();
  }

  @Get("contestations")
  listContestations(): Promise<ListContestationsResponse> {
    return this.service.listContestations();
  }
}
