import type {
  CreateLeadSolarProjectRequest,
  LeadSolarProjectResponse,
  ListLeadSolarProjectsResponse,
  UpdateLeadSolarProjectRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";

export abstract class LeadProjetosSolaresRepository {
  abstract list(dealId: string, principal: AuthPrincipal): Promise<ListLeadSolarProjectsResponse>;
  abstract create(dealId: string, input: CreateLeadSolarProjectRequest, principal: AuthPrincipal): Promise<LeadSolarProjectResponse>;
  abstract update(dealId: string, projectId: string, input: UpdateLeadSolarProjectRequest, principal: AuthPrincipal): Promise<LeadSolarProjectResponse>;
}
