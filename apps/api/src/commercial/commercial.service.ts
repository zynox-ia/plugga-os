import { Inject, Injectable } from "@nestjs/common";
import type {
  ContractDetail,
  ContractList,
  ContractListQuery,
  CreateContractRequest,
  CreateOpportunityRequest,
  LoseOpportunityRequest,
  OpportunityContactRequest,
  OpportunityDetail,
  OpportunityList,
  OpportunityListQuery,
  RevisitOpportunityRequest,
  UpdateContractStatusRequest,
  UpdateOpportunityStageRequest,
  WinOpportunityRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { CommercialRepository } from "./commercial.repository";

@Injectable()
export class CommercialService {
  constructor(@Inject(CommercialRepository) private readonly repository: CommercialRepository) {}

  listOpportunities(query: OpportunityListQuery): Promise<OpportunityList> {
    return this.repository.listOpportunities(query);
  }

  opportunity(id: string): Promise<OpportunityDetail> {
    return this.repository.opportunity(id);
  }

  createOpportunity(input: CreateOpportunityRequest, principal: AuthPrincipal): Promise<OpportunityDetail> {
    return this.repository.createOpportunity(input, principal);
  }

  updateOpportunityStage(
    id: string,
    input: UpdateOpportunityStageRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    return this.repository.updateOpportunityStage(id, input, principal);
  }

  registerOpportunityContact(
    id: string,
    input: OpportunityContactRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    return this.repository.registerOpportunityContact(id, input, principal);
  }

  winOpportunity(id: string, input: WinOpportunityRequest, principal: AuthPrincipal): Promise<OpportunityDetail> {
    return this.repository.winOpportunity(id, input, principal);
  }

  loseOpportunity(id: string, input: LoseOpportunityRequest, principal: AuthPrincipal): Promise<OpportunityDetail> {
    return this.repository.loseOpportunity(id, input, principal);
  }

  revisitOpportunity(
    id: string,
    input: RevisitOpportunityRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    return this.repository.revisitOpportunity(id, input, principal);
  }

  listContracts(query: ContractListQuery): Promise<ContractList> {
    return this.repository.listContracts(query);
  }

  contract(id: string): Promise<ContractDetail> {
    return this.repository.contract(id);
  }

  createContract(input: CreateContractRequest, principal: AuthPrincipal): Promise<ContractDetail> {
    return this.repository.createContract(input, principal);
  }

  updateContractStatus(
    id: string,
    input: UpdateContractStatusRequest,
    principal: AuthPrincipal,
  ): Promise<ContractDetail> {
    return this.repository.updateContractStatus(id, input, principal);
  }
}
