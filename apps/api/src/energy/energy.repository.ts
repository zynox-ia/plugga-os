import type {
  ApproveCycleReportRequest,
  AuditDetail,
  CloseCycleRequest,
  ContestationDetail,
  CreateAuditRequest,
  CreateContestationRequest,
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
  ResolveAuditRequest,
  SendCycleReportRequest,
  UpdateContestationStatusRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";

/**
 * Fundação: leitura apenas. Tickets 2-4 estendem este contrato com as
 * mutações do próprio fluxo (market-migrations, cycles, audits/contestations)
 * sem reabrir os métodos de leitura de outro fluxo.
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
  abstract audit(id: string): Promise<AuditDetail>;
  abstract createAudit(input: CreateAuditRequest, principal: AuthPrincipal): Promise<AuditDetail>;
  abstract resolveAudit(id: string, input: ResolveAuditRequest, principal: AuthPrincipal): Promise<AuditDetail>;

  abstract listContestations(): Promise<ListContestationsResponse>;
  abstract contestation(id: string): Promise<ContestationDetail>;
  abstract createContestation(input: CreateContestationRequest, principal: AuthPrincipal): Promise<ContestationDetail>;
  abstract updateContestationStatus(
    id: string,
    input: UpdateContestationStatusRequest,
    principal: AuthPrincipal,
  ): Promise<ContestationDetail>;
}
