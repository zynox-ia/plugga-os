import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  bulkDealsRequestSchema,
  convertLeadRequestSchema,
  createDealRequestSchema,
  listDealsQuerySchema,
  loseDealRequestSchema,
  moveDealStageRequestSchema,
  setDealPriorityRequestSchema,
  transferDealRequestSchema,
  winDealRequestSchema,
  type BulkDealsRequest,
  type ConvertLeadRequest,
  type ConvertLeadResponse,
  type CreateDealRequest,
  type Deal,
  type DealClientOptionsResponse,
  type ListDealsQuery,
  type ListDealsResponse,
  type LoseDealRequest,
  type MoveDealStageRequest,
  type SetDealPriorityRequest,
  type TransferDealRequest,
  type WinDealRequest,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { NegociosService } from "./negocios.service";

/**
 * Leads no quadro do pipeline (PLU-271). A tela concede acesso aos seus leads,
 * sem limitar pelo responsável. Lead tem dados
 * próprios; só vira cliente por conversão (manual, ao ganhar ou ao transferir).
 */
@Controller("leads")
@UseGuards(SessionAuthGuard, AcessoGuard)
@Departamento("crm")
@Tela("crm.pipelines")
export class NegociosController {
  constructor(@Inject(NegociosService) private readonly service: NegociosService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listDealsQuerySchema)) query: ListDealsQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<ListDealsResponse> {
    return this.service.list(query, principal);
  }

  /** Contatos do cliente já vinculado, para o formulário do negócio. */
  @Get("clientes/:clientId/opcoes")
  @Tela("crm.clientes")
  clientOptions(@Param("clientId", ParseUUIDPipe) clientId: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<DealClientOptionsResponse> {
    return this.service.clientOptions(clientId, principal);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  create(@Body(new ZodValidationPipe(createDealRequestSchema)) input: CreateDealRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<Deal> {
    return this.service.create(input, principal);
  }

  @Post("lote")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  bulk(@Body(new ZodValidationPipe(bulkDealsRequestSchema)) input: BulkDealsRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<ListDealsResponse> {
    return this.service.bulk(input, principal);
  }

  /** Vincula a um cliente já cadastrado (documento igual ou escolha explícita) ou cria um novo. Idempotente. */
  @Post(":id/converter")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  convert(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(convertLeadRequestSchema)) input: ConvertLeadRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ConvertLeadResponse> {
    return this.service.convert(id, input, principal);
  }

  @Post(":id/etapa")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  moveStage(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(moveDealStageRequestSchema)) input: MoveDealStageRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Deal> {
    return this.service.moveStage(id, input, principal);
  }

  @Post(":id/ganho")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  win(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(winDealRequestSchema)) input: WinDealRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Deal> {
    return this.service.win(id, input, principal);
  }

  @Patch(":id/prioridade")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  setPriority(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(setDealPriorityRequestSchema)) input: SetDealPriorityRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<Deal> {
    return this.service.setPriority(id, input, principal);
  }

  @Post(":id/perda")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  lose(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(loseDealRequestSchema)) input: LoseDealRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<Deal> {
    return this.service.lose(id, input, principal);
  }

  @Post(":id/transferencia")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  transfer(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transferDealRequestSchema)) input: TransferDealRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<Deal> {
    return this.service.transfer(id, input, principal);
  }
}
