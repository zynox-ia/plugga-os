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

export abstract class CommercialRepository {
  abstract listOpportunities(query: OpportunityListQuery): Promise<OpportunityList>;
  abstract opportunity(id: string): Promise<OpportunityDetail>;
  abstract createOpportunity(
    input: CreateOpportunityRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail>;
  abstract updateOpportunityStage(
    id: string,
    input: UpdateOpportunityStageRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail>;
  abstract registerOpportunityContact(
    id: string,
    input: OpportunityContactRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail>;
  abstract winOpportunity(
    id: string,
    input: WinOpportunityRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail>;
  abstract loseOpportunity(
    id: string,
    input: LoseOpportunityRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail>;
  abstract revisitOpportunity(
    id: string,
    input: RevisitOpportunityRequest,
    principal: AuthPrincipal,
  ): Promise<OpportunityDetail>;

  abstract listContracts(query: ContractListQuery): Promise<ContractList>;
  abstract contract(id: string): Promise<ContractDetail>;
  abstract createContract(input: CreateContractRequest, principal: AuthPrincipal): Promise<ContractDetail>;
  abstract updateContractStatus(
    id: string,
    input: UpdateContractStatusRequest,
    principal: AuthPrincipal,
  ): Promise<ContractDetail>;
}
