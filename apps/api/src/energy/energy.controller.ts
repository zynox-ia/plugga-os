import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  approveCycleReportRequestSchema,
  closeCycleRequestSchema,
  createAuditRequestSchema,
  createContestationRequestSchema,
  createCycleRequestSchema,
  cycleListQuerySchema,
  cycleReportsQuerySchema,
  generateCycleReportRequestSchema,
  markCycleDocumentsReceivedRequestSchema,
  resolveAuditRequestSchema,
  sendCycleReportRequestSchema,
  updateContestationStatusRequestSchema,
  type ApproveCycleReportRequest,
  type AuditDetail,
  type CloseCycleRequest,
  type ContestationDetail,
  type CreateAuditRequest,
  type CreateContestationRequest,
  type CreateCycleRequest,
  type CycleDetail,
  type CycleListQuery,
  type CycleReportsQuery,
  type CycleReportsResponse,
  type GenerateCycleReportRequest,
  type ListAuditsResponse,
  type ListConsumerUnitsResponse,
  type ListContestationsResponse,
  type ListCyclesResponse,
  type ListMarketMigrationsResponse,
  type MarkCycleDocumentsReceivedRequest,
  type ResolveAuditRequest,
  type SendCycleReportRequest,
  type UpdateContestationStatusRequest,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { EnergyService } from "./energy.service";
import { APPROVE_REPORT, CLOSE_CYCLE, OPERATE_ENERGY, READ_ENERGY, RESOLVE_CONTESTATION } from "./energy.permissions";

@Controller("energy")
@UseGuards(DevAuthGuard, RolesGuard)
@Roles(...READ_ENERGY)
export class EnergyController {
  constructor(@Inject(EnergyService) private readonly service: EnergyService) {}

  @Get("consumer-units")
  listConsumerUnits(): Promise<ListConsumerUnitsResponse> {
    return this.service.listConsumerUnits();
  }

  @Get("market-migrations")
  listMarketMigrations(): Promise<ListMarketMigrationsResponse> {
    return this.service.listMarketMigrations();
  }

  @Get("cycles")
  listCycles(
    @Query(new ZodValidationPipe(cycleListQuerySchema)) query: CycleListQuery,
  ): Promise<ListCyclesResponse> {
    return this.service.listCycles(query);
  }

  @Get("reports")
  cycleReports(
    @Query(new ZodValidationPipe(cycleReportsQuerySchema)) query: CycleReportsQuery,
  ): Promise<CycleReportsResponse> {
    return this.service.cycleReports(query);
  }

  @Get("cycles/:id")
  cycle(@Param("id") id: string): Promise<CycleDetail> {
    return this.service.cycle(id);
  }

  @Post("cycles")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERATE_ENERGY)
  createCycle(
    @Body(new ZodValidationPipe(createCycleRequestSchema)) input: CreateCycleRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    return this.service.createCycle(input, principal);
  }

  @Post("cycles/:id/documents-received")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERATE_ENERGY)
  markCycleDocumentsReceived(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(markCycleDocumentsReceivedRequestSchema)) input: MarkCycleDocumentsReceivedRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    return this.service.markCycleDocumentsReceived(id, input, principal);
  }

  @Post("cycles/:id/report")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERATE_ENERGY)
  generateCycleReport(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(generateCycleReportRequestSchema)) input: GenerateCycleReportRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    return this.service.generateCycleReport(id, input, principal);
  }

  @Post("cycles/:id/approve-report")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...APPROVE_REPORT)
  approveCycleReport(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(approveCycleReportRequestSchema)) input: ApproveCycleReportRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    return this.service.approveCycleReport(id, input, principal);
  }

  @Post("cycles/:id/send")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERATE_ENERGY)
  sendCycleReport(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(sendCycleReportRequestSchema)) input: SendCycleReportRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    return this.service.sendCycleReport(id, input, principal);
  }

  @Post("cycles/:id/close")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...CLOSE_CYCLE)
  closeCycle(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(closeCycleRequestSchema)) input: CloseCycleRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    return this.service.closeCycle(id, input, principal);
  }

  @Get("audits")
  listAudits(): Promise<ListAuditsResponse> {
    return this.service.listAudits();
  }

  @Get("audits/:id")
  audit(@Param("id") id: string): Promise<AuditDetail> {
    return this.service.audit(id);
  }

  @Post("audits")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERATE_ENERGY)
  createAudit(
    @Body(new ZodValidationPipe(createAuditRequestSchema)) input: CreateAuditRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<AuditDetail> {
    return this.service.createAudit(input, principal);
  }

  @Post("audits/:id/resolve")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERATE_ENERGY)
  resolveAudit(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resolveAuditRequestSchema)) input: ResolveAuditRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<AuditDetail> {
    return this.service.resolveAudit(id, input, principal);
  }

  @Get("contestations")
  listContestations(): Promise<ListContestationsResponse> {
    return this.service.listContestations();
  }

  @Get("contestations/:id")
  contestation(@Param("id") id: string): Promise<ContestationDetail> {
    return this.service.contestation(id);
  }

  @Post("contestations")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERATE_ENERGY)
  createContestation(
    @Body(new ZodValidationPipe(createContestationRequestSchema)) input: CreateContestationRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ContestationDetail> {
    return this.service.createContestation(input, principal);
  }

  @Post("contestations/:id/status")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles(...RESOLVE_CONTESTATION)
  updateContestationStatus(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateContestationStatusRequestSchema)) input: UpdateContestationStatusRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ContestationDetail> {
    return this.service.updateContestationStatus(id, input, principal);
  }
}
