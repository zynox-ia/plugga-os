import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  contractListQuerySchema,
  telasPorDepartamento,
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
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import { CommercialService } from "./commercial.service";

/**
 * Oportunidades e contratos: o CRM opera; o Financeiro só lê (contratos
 * alimentam o faturamento).
 */
@Controller("commercial")
@UseGuards(SessionAuthGuard, AcessoGuard)
@Departamento(["crm", "financeiro"])
export class CommercialController {
  constructor(@Inject(CommercialService) private readonly service: CommercialService) {}

  @Get("opportunities")
  @Tela("crm.pipelines", ...telasPorDepartamento.financeiro)
  listOpportunities(
    @Query(new ZodValidationPipe(opportunityListQuerySchema)) query: OpportunityListQuery,
  ): Promise<OpportunityList> {
    return this.service.listOpportunities(query);
  }

  @Get("opportunities/:id")
  @Tela("crm.pipelines", ...telasPorDepartamento.financeiro)
  opportunity(@Param("id", ParseUUIDPipe) id: string): Promise<OpportunityDetail> {
    return this.service.opportunity(id);
  }

  @Post("opportunities")
  @Tela("crm.pipelines")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento("crm")
  createOpportunity(
    @Body(new ZodValidationPipe(createOpportunityRequestSchema)) input: CreateOpportunityRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    return this.service.createOpportunity(input, principal);
  }

  @Post("opportunities/:id/stage")
  @Tela("crm.pipelines")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento("crm")
  updateOpportunityStage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateOpportunityStageRequestSchema)) input: UpdateOpportunityStageRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    return this.service.updateOpportunityStage(id, input, principal);
  }

  @Post("opportunities/:id/contacts")
  @Tela("crm.pipelines")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento("crm")
  registerOpportunityContact(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(opportunityContactRequestSchema)) input: OpportunityContactRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    return this.service.registerOpportunityContact(id, input, principal);
  }

  @Post("opportunities/:id/win")
  @Tela("crm.pipelines")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento("crm")
  winOpportunity(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(winOpportunityRequestSchema)) input: WinOpportunityRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    return this.service.winOpportunity(id, input, principal);
  }

  @Post("opportunities/:id/lose")
  @Tela("crm.pipelines")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento("crm")
  loseOpportunity(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(loseOpportunityRequestSchema)) input: LoseOpportunityRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    return this.service.loseOpportunity(id, input, principal);
  }

  @Post("opportunities/:id/revisit")
  @Tela("crm.pipelines")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento("crm")
  revisitOpportunity(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(revisitOpportunityRequestSchema)) input: RevisitOpportunityRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<OpportunityDetail> {
    return this.service.revisitOpportunity(id, input, principal);
  }

  @Get("contracts")
  @Tela("crm.contratos", ...telasPorDepartamento.financeiro)
  listContracts(
    @Query(new ZodValidationPipe(contractListQuerySchema)) query: ContractListQuery,
  ): Promise<ContractList> {
    return this.service.listContracts(query);
  }

  @Get("contracts/:id")
  @Tela("crm.contratos", ...telasPorDepartamento.financeiro)
  contract(@Param("id", ParseUUIDPipe) id: string): Promise<ContractDetail> {
    return this.service.contract(id);
  }

  @Post("contracts")
  @Tela("crm.contratos")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento("crm")
  createContract(
    @Body(new ZodValidationPipe(createContractRequestSchema)) input: CreateContractRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ContractDetail> {
    return this.service.createContract(input, principal);
  }

  @Post("contracts/:id/status")
  @Tela("crm.contratos")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento("crm")
  updateContractStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateContractStatusRequestSchema)) input: UpdateContractStatusRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ContractDetail> {
    return this.service.updateContractStatus(id, input, principal);
  }
}
