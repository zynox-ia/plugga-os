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

/**
 * Fundação: leitura apenas. Tickets 2-4 estendem este contrato com as
 * mutações do próprio fluxo (market-migrations, cycles, audits/contestations)
 * sem reabrir os métodos de leitura abaixo.
 */
export abstract class EnergyRepository {
  abstract listConsumerUnits(): Promise<ListConsumerUnitsResponse>;
  abstract listMarketMigrations(): Promise<ListMarketMigrationsResponse>;
  abstract listCycles(): Promise<ListCyclesResponse>;
  abstract listAudits(): Promise<ListAuditsResponse>;
  abstract listContestations(): Promise<ListContestationsResponse>;

  abstract createMarketMigration(
    input: CreateMarketMigrationRequest,
    principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail>;
  abstract advanceMarketMigrationStage(
    id: string,
    input: AdvanceMarketMigrationStageRequest,
    principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail>;
  abstract cancelMarketMigration(
    id: string,
    input: CancelMarketMigrationRequest,
    principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail>;
  abstract activateMarketMigration(
    id: string,
    input: ActivateMarketMigrationRequest,
    principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail>;
}
