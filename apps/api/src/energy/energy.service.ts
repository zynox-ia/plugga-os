import { Inject, Injectable } from "@nestjs/common";
import type {
  ListAuditsResponse,
  ListConsumerUnitsResponse,
  ListContestationsResponse,
  ListCyclesResponse,
  ListMarketMigrationsResponse,
} from "@plugga/shared";

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
}
