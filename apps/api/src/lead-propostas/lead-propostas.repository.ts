import type {
  CreateLeadProposalRequest, LeadDocument, LeadProposal, ListLeadProposalsResponse,
  ListLeadProposalTemplatesResponse, UpdateLeadProposalRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";

export type GeracaoDeProposta = { proposal: LeadProposal; token: string };

export abstract class LeadPropostasRepository {
  abstract list(dealId: string, principal: AuthPrincipal): Promise<ListLeadProposalsResponse>;
  abstract templates(dealId: string, principal: AuthPrincipal): Promise<ListLeadProposalTemplatesResponse>;
  abstract get(dealId: string, id: string, principal: AuthPrincipal): Promise<LeadProposal>;
  abstract create(dealId: string, input: CreateLeadProposalRequest, principal: AuthPrincipal): Promise<LeadProposal>;
  abstract update(dealId: string, id: string, input: UpdateLeadProposalRequest, principal: AuthPrincipal): Promise<LeadProposal>;
  abstract beginGeneration(dealId: string, id: string, revision: number, principal: AuthPrincipal): Promise<GeracaoDeProposta>;
  abstract completeGeneration(dealId: string, generation: GeracaoDeProposta, document: LeadDocument, principal: AuthPrincipal): Promise<LeadProposal>;
  abstract releaseGeneration(id: string, token: string): Promise<void>;
}
