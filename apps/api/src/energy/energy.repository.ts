import type {
  AuditDetail,
  ContestationDetail,
  CreateAuditRequest,
  CreateContestationRequest,
  ListAuditsResponse,
  ListConsumerUnitsResponse,
  ListContestationsResponse,
  ListCyclesResponse,
  ListMarketMigrationsResponse,
  ResolveAuditRequest,
  UpdateContestationStatusRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";

/**
 * Fundação: leitura apenas para market-migrations/cycles. Este ticket
 * (audits/contestations) estende o contrato com as mutações do próprio
 * fluxo, sem reabrir os métodos de leitura de market-migrations/cycles.
 */
export abstract class EnergyRepository {
  abstract listConsumerUnits(): Promise<ListConsumerUnitsResponse>;
  abstract listMarketMigrations(): Promise<ListMarketMigrationsResponse>;
  abstract listCycles(): Promise<ListCyclesResponse>;

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
