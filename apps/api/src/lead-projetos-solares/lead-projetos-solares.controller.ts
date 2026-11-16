import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  createLeadSolarProjectRequestSchema,
  updateLeadSolarProjectRequestSchema,
  type CreateLeadSolarProjectRequest,
  type UpdateLeadSolarProjectRequest,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { LeadProjetosSolaresService } from "./lead-projetos-solares.service";

@Controller("leads/:dealId/projetos-solares")
@UseGuards(SessionAuthGuard, AcessoGuard)
@Departamento("crm")
@Tela("crm.pipelines")
export class LeadProjetosSolaresController {
  constructor(@Inject(LeadProjetosSolaresService) private readonly service: LeadProjetosSolaresService) {}

  @Get()
  list(@Param("dealId", ParseUUIDPipe) dealId: string, @CurrentPrincipal() principal: AuthPrincipal) {
    return this.service.list(dealId, principal);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  create(
    @Param("dealId", ParseUUIDPipe) dealId: string,
    @Body(new ZodValidationPipe(createLeadSolarProjectRequestSchema)) input: CreateLeadSolarProjectRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ) {
    return this.service.create(dealId, input, principal);
  }

  @Patch(":projectId")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  update(
    @Param("dealId", ParseUUIDPipe) dealId: string,
    @Param("projectId", ParseUUIDPipe) projectId: string,
    @Body(new ZodValidationPipe(updateLeadSolarProjectRequestSchema)) input: UpdateLeadSolarProjectRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ) {
    return this.service.update(dealId, projectId, input, principal);
  }
}
