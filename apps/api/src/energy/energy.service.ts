import { Inject, Injectable } from "@nestjs/common";
import type {
  ActivateMarketMigrationRequest,
  AdvanceMarketMigrationStageRequest,
  CancelMarketMigrationRequest,
  CreateMarketMigrationRequest,
  ListAuditsResponse,
  ListConsumerUnitsResponse,
  ListContestationsResponse,
  ListCyclesResponse,
  ListMarketMigrationsResponse,
  MarketMigrationDetail,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { EnergyRepository } from "./energy.repository";

@Injectable()
export class EnergyService {
  constructor(@Inject(EnergyRepository) private readonly repository: EnergyRepository) {}

  listConsumerUnits(): Promise<ListConsumerUnitsResponse> {
    return this.repository.listConsumerUnits();
  }

  listMarketMigrations(): Promise<ListMarketMigrationsResponse> {
    return this.repository.listMarketMigrations();
  }

  listCycles(): Promise<ListCyclesResponse> {
    return this.repository.listCycles();
  }

  listAudits(): Promise<ListAuditsResponse> {
    return this.repository.listAudits();
  }

  listContestations(): Promise<ListContestationsResponse> {
    return this.repository.listContestations();
  }

  createMarketMigration(
    input: CreateMarketMigrationRequest,
    principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    return this.repository.createMarketMigration(input, principal);
  }

  advanceMarketMigrationStage(
    id: string,
    input: AdvanceMarketMigrationStageRequest,
    principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    return this.repository.advanceMarketMigrationStage(id, input, principal);
  }

  cancelMarketMigration(
    id: string,
    input: CancelMarketMigrationRequest,
    principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    return this.repository.cancelMarketMigration(id, input, principal);
  }

  activateMarketMigration(
    id: string,
    input: ActivateMarketMigrationRequest,
    principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    return this.repository.activateMarketMigration(id, input, principal);
  }
}
