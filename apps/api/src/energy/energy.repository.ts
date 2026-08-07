import type {
  ListAuditsResponse,
  ListConsumerUnitsResponse,
  ListContestationsResponse,
  ListCyclesResponse,
  ListMarketMigrationsResponse,
} from "@plugga/shared";

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
}
