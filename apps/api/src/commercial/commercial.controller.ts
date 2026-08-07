import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  contractListQuerySchema,
  createContractRequestSchema,
  createOpportunityRequestSchema,
  loseOpportunityRequestSchema,
  opportunityContactRequestSchema,
  opportunityListQuerySchema,
  revisitOpportunityRequestSchema,
  updateContractStatusRequestSchema,
  updateOpportunityStageRequestSchema,
  winOpportunityRequestSchema,
  type ContractDetail,
  type ContractList,
  type ContractListQuery,
  type CreateContractRequest,
  type CreateOpportunityRequest,
  type LoseOpportunityRequest,
  type OpportunityContactRequest,
  type OpportunityDetail,
  type OpportunityList,
  type OpportunityListQuery,
  type RevisitOpportunityRequest,
  type UpdateContractStatusRequest,
  type UpdateOpportunityStageRequest,
  type WinOpportunityRequest,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { CommercialService } from "./commercial.service";

/**
 * Contracts have no finer-grained role decision yet (spec §"Limites"), so they
 * intentionally share the opportunities mutation roles below rather than
 * inventing a new role. Revisit once RBAC for contracts is decided.
 */
const READ_ROLES = ["comercial", "admin", "diretoria", "financeiro", "tech", "viewer"] as const;
const MUTATE_ROLES = ["comercial", "admin"] as const;

@Controller("commercial")
@UseGuards(DevAuthGuard, RolesGuard)
@Roles(...READ_ROLES)
export class CommercialController {
  constructor(@Inject(CommercialService) private readonly service: CommercialService) {}

  @Get("opportunities")
  listOpportunities(
    @Query(new ZodValidationPipe(opportunityListQuerySchema)) query: OpportunityListQuery,
  ): Promise<OpportunityList> {
    return this.service.listOpportunities(query);
  }

  @Get("opportunities/:id")
  opportunity(@Param("id") id: string): Promise<OpportunityDetail> {
    return this.service.opportunity(id);
  }

  @Post("opportunities")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard)
  @Roles(...MUTATE_ROLES)
  createOpportunity(
    @Body(new ZodValidationPipe(createOpportunityRequestSchema)) input: CreateOpportunityRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    return this.service.createOpportunity(input, principal);
  }

  @Post("opportunities/:id/stage")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...MUTATE_ROLES)
  updateOpportunityStage(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOpportunityStageRequestSchema)) input: UpdateOpportunityStageRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    return this.service.updateOpportunityStage(id, input, principal);
  }

  @Post("opportunities/:id/contacts")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...MUTATE_ROLES)
  registerOpportunityContact(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(opportunityContactRequestSchema)) input: OpportunityContactRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    return this.service.registerOpportunityContact(id, input, principal);
  }

  @Post("opportunities/:id/win")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...MUTATE_ROLES)
  winOpportunity(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(winOpportunityRequestSchema)) input: WinOpportunityRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    return this.service.winOpportunity(id, input, principal);
  }

  @Post("opportunities/:id/lose")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...MUTATE_ROLES)
  loseOpportunity(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(loseOpportunityRequestSchema)) input: LoseOpportunityRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    return this.service.loseOpportunity(id, input, principal);
  }

  @Post("opportunities/:id/revisit")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...MUTATE_ROLES)
  revisitOpportunity(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(revisitOpportunityRequestSchema)) input: RevisitOpportunityRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    return this.service.revisitOpportunity(id, input, principal);
  }

  @Get("contracts")
  listContracts(
    @Query(new ZodValidationPipe(contractListQuerySchema)) query: ContractListQuery,
  ): Promise<ContractList> {
    return this.service.listContracts(query);
  }

  @Get("contracts/:id")
  contract(@Param("id") id: string): Promise<ContractDetail> {
    return this.service.contract(id);
  }

  @Post("contracts")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard)
  @Roles(...MUTATE_ROLES)
  createContract(
    @Body(new ZodValidationPipe(createContractRequestSchema)) input: CreateContractRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ContractDetail> {
    return this.service.createContract(input, principal);
  }

  @Post("contracts/:id/status")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...MUTATE_ROLES)
  updateContractStatus(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateContractStatusRequestSchema)) input: UpdateContractStatusRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ContractDetail> {
    return this.service.updateContractStatus(id, input, principal);
  }
}
