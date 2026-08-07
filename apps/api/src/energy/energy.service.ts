import { Inject, Injectable } from "@nestjs/common";
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

  audit(id: string): Promise<AuditDetail> {
    return this.repository.audit(id);
  }

  createAudit(input: CreateAuditRequest, principal: AuthPrincipal): Promise<AuditDetail> {
    return this.repository.createAudit(input, principal);
  }

  resolveAudit(id: string, input: ResolveAuditRequest, principal: AuthPrincipal): Promise<AuditDetail> {
    return this.repository.resolveAudit(id, input, principal);
  }

  listContestations(): Promise<ListContestationsResponse> {
    return this.repository.listContestations();
  }

  contestation(id: string): Promise<ContestationDetail> {
    return this.repository.contestation(id);
  }

  createContestation(input: CreateContestationRequest, principal: AuthPrincipal): Promise<ContestationDetail> {
    return this.repository.createContestation(input, principal);
  }

  updateContestationStatus(
    id: string,
    input: UpdateContestationStatusRequest,
    principal: AuthPrincipal,
  ): Promise<ContestationDetail> {
    return this.repository.updateContestationStatus(id, input, principal);
  }
}
