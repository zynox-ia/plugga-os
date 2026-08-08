import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import {
  approveEnergyStudyRequestSchema,
  createEnergyStudyRequestSchema,
  energyStudyListQuerySchema,
  submitEnergyInvoiceRequestSchema,
  type ApproveEnergyStudyRequest,
  type CreateEnergyStudyRequest,
  type EnergyStudyDetail,
  type EnergyStudyListQuery,
  type ListEnergyStudiesResponse,
  type SubmitEnergyInvoiceRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { APROVAR_ESTUDO, LER_ESTUDO, OPERAR_ESTUDO } from "./estudo.permissions.js";
import { EstudoService } from "./estudo.service.js";

@Controller("energy-efficiency/studies")
@UseGuards(DevAuthGuard, RolesGuard)
@Roles(...LER_ESTUDO)
export class EstudoController {
  constructor(private readonly service: EstudoService) {}

  @Get()
  listar(
    @Query(new ZodValidationPipe(energyStudyListQuerySchema)) query: EnergyStudyListQuery,
  ): Promise<ListEnergyStudiesResponse> {
    return this.service.listar(query);
  }

  @Get(":id")
  detalhar(@Param("id", ParseUUIDPipe) id: string): Promise<EnergyStudyDetail> {
    return this.service.detalhar(id);
  }

  /**
   * O documento sai como HTML porque é a fonte: o PDF é derivado dele. Servir o
   * HTML permite conferir no navegador antes de gerar o arquivo final.
   */
  @Get(":id/document")
  @Header("content-type", "text/html; charset=utf-8")
  documento(@Param("id", ParseUUIDPipe) id: string): Promise<string> {
    return this.service.documento(id);
  }

  @Post()
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERAR_ESTUDO)
  criar(
    @Body(new ZodValidationPipe(createEnergyStudyRequestSchema)) body: CreateEnergyStudyRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<EnergyStudyDetail> {
    return this.service.criar(body, principal);
  }

  @Post(":id/invoice")
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERAR_ESTUDO)
  receberFatura(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(submitEnergyInvoiceRequestSchema)) body: SubmitEnergyInvoiceRequest,
  ): Promise<EnergyStudyDetail> {
    return this.service.receberFatura(id, body);
  }

  /** Recalcula depois de corrigir dado ou premissa; refaz a validação. */
  @Post(":id/recalculate")
  @UseGuards(OriginCheckGuard)
  @Roles(...OPERAR_ESTUDO)
  recalcular(@Param("id", ParseUUIDPipe) id: string): Promise<EnergyStudyDetail> {
    return this.service.calcular(id);
  }

  @Post(":id/approve")
  @UseGuards(OriginCheckGuard)
  @Roles(...APROVAR_ESTUDO)
  aprovar(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approveEnergyStudyRequestSchema)) body: ApproveEnergyStudyRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<EnergyStudyDetail> {
    return this.service.aprovar(id, body, principal);
  }

  @Post(":id/sent")
  @UseGuards(OriginCheckGuard)
  @Roles(...APROVAR_ESTUDO)
  marcarEnviado(@Param("id", ParseUUIDPipe) id: string): Promise<EnergyStudyDetail> {
    return this.service.marcarEnviado(id);
  }
}
