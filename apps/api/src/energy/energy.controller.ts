import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type {
  ListAuditsResponse,
  ListConsumerUnitsResponse,
  ListContestationsResponse,
  ListCyclesResponse,
  ListMarketMigrationsResponse,
} from "@plugga/shared";

import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { EnergyService } from "./energy.service";
import { READ_ENERGY } from "./energy.permissions";

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

  @Get("contestations")
  listContestations(): Promise<ListContestationsResponse> {
    return this.service.listContestations();
  }
}
