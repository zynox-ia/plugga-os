import { Inject, Injectable } from "@nestjs/common";
import type {
  CreateLeadSolarProjectRequest,
  LeadSolarProjectResponse,
  ListLeadSolarProjectsResponse,
  UpdateLeadSolarProjectRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { LeadProjetosSolaresRepository } from "./lead-projetos-solares.repository";

@Injectable()
export class LeadProjetosSolaresService {
  constructor(@Inject(LeadProjetosSolaresRepository) private readonly repository: LeadProjetosSolaresRepository) {}

  list(dealId: string, principal: AuthPrincipal): Promise<ListLeadSolarProjectsResponse> {
    return this.repository.list(dealId, principal);
  }

  async create(dealId: string, input: CreateLeadSolarProjectRequest, principal: AuthPrincipal): Promise<LeadSolarProjectResponse> {
    return this.repository.create(dealId, input, principal);
  }

  async update(
    dealId: string,
    projectId: string,
    input: UpdateLeadSolarProjectRequest,
    principal: AuthPrincipal,
  ): Promise<LeadSolarProjectResponse> {
    return this.repository.update(dealId, projectId, input, principal);
  }
}
