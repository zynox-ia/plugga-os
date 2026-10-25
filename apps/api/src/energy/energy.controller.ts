import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  activateMarketMigrationRequestSchema,
  advanceMarketMigrationStageRequestSchema,
  approveCycleReportRequestSchema,
  cancelMarketMigrationRequestSchema,
  closeCycleRequestSchema,
  createAuditRequestSchema,
  createContestationRequestSchema,
  createCycleRequestSchema,
  createMarketMigrationRequestSchema,
  cycleListQuerySchema,
  cycleReportsQuerySchema,
  generateCycleReportRequestSchema,
  markCycleDocumentsReceivedRequestSchema,
  resolveAuditRequestSchema,
  sendCycleReportRequestSchema,
  updateContestationStatusRequestSchema,
  type ActivateMarketMigrationRequest,
  type AdvanceMarketMigrationStageRequest,
  type ApproveCycleReportRequest,
  type AuditDetail,
  type CancelMarketMigrationRequest,
  type CloseCycleRequest,
  type ContestationDetail,
  type CreateAuditRequest,
  type CreateContestationRequest,
  type CreateCycleRequest,
  type CreateMarketMigrationRequest,
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
  type MarketMigrationDetail,
  type MarkCycleDocumentsReceivedRequest,
  type ResolveAuditRequest,
  type SendCycleReportRequest,
  type UpdateContestationStatusRequest,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Departamento } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import { EnergyService } from "./energy.service";
import { APROVAR_EM_ENERGIA, FECHAR_CICLO, OPERAR_ENERGIA, VER_ENERGIA } from "./energy.permissions";

@Controller("energy")
@UseGuards(SessionAuthGuard, AcessoGuard)
@Departamento(VER_ENERGIA)
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

  @Post("market-migrations")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_ENERGIA)
  createMarketMigration(
    @Body(new ZodValidationPipe(createMarketMigrationRequestSchema)) input: CreateMarketMigrationRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    return this.service.createMarketMigration(input, principal);
  }

  @Post("market-migrations/:id/stage")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_ENERGIA)
  advanceMarketMigrationStage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(advanceMarketMigrationStageRequestSchema)) input: AdvanceMarketMigrationStageRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    return this.service.advanceMarketMigrationStage(id, input, principal);
  }

  @Post("market-migrations/:id/cancel")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_ENERGIA)
  cancelMarketMigration(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelMarketMigrationRequestSchema)) input: CancelMarketMigrationRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    return this.service.cancelMarketMigration(id, input, principal);
  }

  @Post("market-migrations/:id/activate")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_ENERGIA)
  activateMarketMigration(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(activateMarketMigrationRequestSchema)) input: ActivateMarketMigrationRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<MarketMigrationDetail> {
    return this.service.activateMarketMigration(id, input, principal);
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
  cycle(@Param("id", ParseUUIDPipe) id: string): Promise<CycleDetail> {
    return this.service.cycle(id);
  }

  @Post("cycles")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_ENERGIA)
  createCycle(
    @Body(new ZodValidationPipe(createCycleRequestSchema)) input: CreateCycleRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    return this.service.createCycle(input, principal);
  }

  @Post("cycles/:id/documents-received")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_ENERGIA)
  markCycleDocumentsReceived(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(markCycleDocumentsReceivedRequestSchema)) input: MarkCycleDocumentsReceivedRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    return this.service.markCycleDocumentsReceived(id, input, principal);
  }

  @Post("cycles/:id/report")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_ENERGIA)
  generateCycleReport(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(generateCycleReportRequestSchema)) input: GenerateCycleReportRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    return this.service.generateCycleReport(id, input, principal);
  }

  @Post("cycles/:id/approve-report")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(APROVAR_EM_ENERGIA, "gerente")
  approveCycleReport(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approveCycleReportRequestSchema)) input: ApproveCycleReportRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    return this.service.approveCycleReport(id, input, principal);
  }

  @Post("cycles/:id/send")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_ENERGIA)
  sendCycleReport(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(sendCycleReportRequestSchema)) input: SendCycleReportRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<CycleDetail> {
    return this.service.sendCycleReport(id, input, principal);
  }

  @Post("cycles/:id/close")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(FECHAR_CICLO)
  closeCycle(
    @Param("id", ParseUUIDPipe) id: string,
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
  audit(@Param("id", ParseUUIDPipe) id: string): Promise<AuditDetail> {
    return this.service.audit(id);
  }

  @Post("audits")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_ENERGIA)
  createAudit(
    @Body(new ZodValidationPipe(createAuditRequestSchema)) input: CreateAuditRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<AuditDetail> {
    return this.service.createAudit(input, principal);
  }

  @Post("audits/:id/resolve")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_ENERGIA)
  resolveAudit(
    @Param("id", ParseUUIDPipe) id: string,
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
  contestation(@Param("id", ParseUUIDPipe) id: string): Promise<ContestationDetail> {
    return this.service.contestation(id);
  }

  @Post("contestations")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(OPERAR_ENERGIA)
  createContestation(
    @Body(new ZodValidationPipe(createContestationRequestSchema)) input: CreateContestationRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ContestationDetail> {
    return this.service.createContestation(input, principal);
  }

  @Post("contestations/:id/status")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Departamento(APROVAR_EM_ENERGIA, "gerente")
  updateContestationStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateContestationStatusRequestSchema)) input: UpdateContestationStatusRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ContestationDetail> {
    return this.service.updateContestationStatus(id, input, principal);
  }
}
