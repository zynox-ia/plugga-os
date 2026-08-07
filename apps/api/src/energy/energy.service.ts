import { Inject, Injectable } from "@nestjs/common";
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

  listCycles(query?: CycleListQuery): Promise<ListCyclesResponse> {
    return this.repository.listCycles(query);
  }

  cycle(id: string): Promise<CycleDetail> {
    return this.repository.cycle(id);
  }

  createCycle(input: CreateCycleRequest, principal: AuthPrincipal): Promise<CycleDetail> {
    return this.repository.createCycle(input, principal);
  }

  markCycleDocumentsReceived(
    id: string,
    input: MarkCycleDocumentsReceivedRequest,
    principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    return this.repository.markCycleDocumentsReceived(id, input, principal);
  }

  generateCycleReport(id: string, input: GenerateCycleReportRequest, principal: AuthPrincipal): Promise<CycleDetail> {
    return this.repository.generateCycleReport(id, input, principal);
  }

  approveCycleReport(id: string, input: ApproveCycleReportRequest, principal: AuthPrincipal): Promise<CycleDetail> {
    return this.repository.approveCycleReport(id, input, principal);
  }

  sendCycleReport(id: string, input: SendCycleReportRequest, principal: AuthPrincipal): Promise<CycleDetail> {
    return this.repository.sendCycleReport(id, input, principal);
  }

  closeCycle(id: string, input: CloseCycleRequest, principal: AuthPrincipal): Promise<CycleDetail> {
    return this.repository.closeCycle(id, input, principal);
  }

  cycleReports(query: CycleReportsQuery): Promise<CycleReportsResponse> {
    return this.repository.cycleReports(query);
  }

  listAudits(): Promise<ListAuditsResponse> {
    return this.repository.listAudits();
  }

  listContestations(): Promise<ListContestationsResponse> {
    return this.repository.listContestations();
  }
}
