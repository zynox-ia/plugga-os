import { pipeline } from "node:stream";

import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Res, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  createLeadProposalRequestSchema, generateLeadProposalRequestSchema, updateLeadProposalRequestSchema,
  type CreateLeadProposalRequest, type GenerateLeadProposalRequest, type UpdateLeadProposalRequest,
} from "@plugga/shared";
import type { Response } from "express";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { cabecalhoDisposicao } from "../lead-documentos/lead-documentos.rules";
import { LeadPropostasService } from "./lead-propostas.service";

@Controller("leads/:dealId/propostas")
@UseGuards(SessionAuthGuard, AcessoGuard)
@Departamento("crm")
@Tela("crm.pipelines")
export class LeadPropostasController {
  constructor(@Inject(LeadPropostasService) private readonly service: LeadPropostasService) {}

  @Get()
  list(@Param("dealId", ParseUUIDPipe) dealId: string, @CurrentPrincipal() principal: AuthPrincipal) {
    return this.service.list(dealId, principal);
  }

  @Get("modelos")
  templates(@Param("dealId", ParseUUIDPipe) dealId: string, @CurrentPrincipal() principal: AuthPrincipal) {
    return this.service.templates(dealId, principal);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  create(
    @Param("dealId", ParseUUIDPipe) dealId: string,
    @Body(new ZodValidationPipe(createLeadProposalRequestSchema)) input: CreateLeadProposalRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ) { return this.service.create(dealId, input, principal); }

  @Patch(":proposalId")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  update(
    @Param("dealId", ParseUUIDPipe) dealId: string,
    @Param("proposalId", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLeadProposalRequestSchema)) input: UpdateLeadProposalRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ) { return this.service.update(dealId, id, input, principal); }

  @Post(":proposalId/gerar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  generate(
    @Param("dealId", ParseUUIDPipe) dealId: string,
    @Param("proposalId", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(generateLeadProposalRequestSchema)) input: GenerateLeadProposalRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ) { return this.service.generate(dealId, id, input, principal); }

  @Get(":proposalId/preview")
  @UseGuards(ThrottlerGuard)
  async preview(
    @Param("dealId", ParseUUIDPipe) dealId: string,
    @Param("proposalId", ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: AuthPrincipal,
    @Res() res: Response,
  ) { await this.send(dealId, id, principal, res, "inline"); }

  @Get(":proposalId/download")
  @UseGuards(ThrottlerGuard)
  async download(
    @Param("dealId", ParseUUIDPipe) dealId: string,
    @Param("proposalId", ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: AuthPrincipal,
    @Res() res: Response,
  ) { await this.send(dealId, id, principal, res, "attachment"); }

  private async send(dealId: string, id: string, principal: AuthPrincipal, res: Response, disposition: "inline" | "attachment") {
    const file = await this.service.file(dealId, id, principal, disposition);
    res.status(200);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", cabecalhoDisposicao(disposition, file.name));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "sandbox");
    res.setHeader("Cache-Control", "no-store");
    pipeline(file.stream, res, () => file.encerrar());
  }
}
