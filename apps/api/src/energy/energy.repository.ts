import type {
  ApproveCycleReportRequest,
  CloseCycleRequest,
  CreateCycleRequest,
  CycleDetail,
  CycleListQuery,
  CycleReportsQuery,
  CycleReportsResponse,
  GenerateCycleReportRequest,
  ListAuditsResponse,
  ListConsumerUnitsResponse,
  ListContestationsResponse,
  ListCyclesResponse,
  ListMarketMigrationsResponse,
  MarkCycleDocumentsReceivedRequest,
  SendCycleReportRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";

/**
 * Fundação: leitura apenas. Tickets 2-4 estendem este contrato com as
 * mutações do próprio fluxo (market-migrations, cycles, audits/contestations)
 * sem reabrir os métodos de leitura abaixo. Ticket 3 (cycles) adiciona o
 * detalhe e as mutações do ciclo.
 */
export abstract class EnergyRepository {
  abstract listConsumerUnits(): Promise<ListConsumerUnitsResponse>;
  abstract listMarketMigrations(): Promise<ListMarketMigrationsResponse>;
  abstract listCycles(query?: CycleListQuery): Promise<ListCyclesResponse>;
  abstract cycle(id: string): Promise<CycleDetail>;
  abstract createCycle(input: CreateCycleRequest, principal: AuthPrincipal): Promise<CycleDetail>;
  abstract markCycleDocumentsReceived(
    id: string,
    input: MarkCycleDocumentsReceivedRequest,
    principal: AuthPrincipal,
  ): Promise<CycleDetail>;
  abstract generateCycleReport(
    id: string,
    input: GenerateCycleReportRequest,
    principal: AuthPrincipal,
  ): Promise<CycleDetail>;
  abstract approveCycleReport(
    id: string,
    input: ApproveCycleReportRequest,
    principal: AuthPrincipal,
  ): Promise<CycleDetail>;
  abstract sendCycleReport(id: string, input: SendCycleReportRequest, principal: AuthPrincipal): Promise<CycleDetail>;
  abstract closeCycle(id: string, input: CloseCycleRequest, principal: AuthPrincipal): Promise<CycleDetail>;
  abstract cycleReports(query: CycleReportsQuery): Promise<CycleReportsResponse>;
  abstract listAudits(): Promise<ListAuditsResponse>;
  abstract listContestations(): Promise<ListContestationsResponse>;
}
