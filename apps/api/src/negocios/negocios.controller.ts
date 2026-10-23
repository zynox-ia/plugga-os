import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  bulkDealsRequestSchema,
  createDealRequestSchema,
  listDealsQuerySchema,
  loseDealRequestSchema,
  moveDealStageRequestSchema,
  transferDealRequestSchema,
  type BulkDealsRequest,
  type CreateDealRequest,
  type Deal,
  type DealClientOptionsResponse,
  type ListDealsQuery,
  type ListDealsResponse,
  type LoseDealRequest,
  type MoveDealStageRequest,
  type TransferDealRequest,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { NegociosService } from "./negocios.service";

/**
 * Negócios no quadro do pipeline (PLU-271). Quem alcança o pipeline (equipe,
 * gestor comercial da empresa ou admin) vê e conduz todos os negócios dele.
 */
@Controller("negocios")
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles("comercial", "admin")
export class NegociosController {
  constructor(@Inject(NegociosService) private readonly service: NegociosService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listDealsQuerySchema)) query: ListDealsQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<ListDealsResponse> {
    return this.service.list(query, principal);
  }

  /** Contatos e UCs do cliente, para o formulário do negócio. */
  @Get("clientes/:clientId/opcoes")
  clientOptions(@Param("clientId", ParseUUIDPipe) clientId: string): Promise<DealClientOptionsResponse> {
    return this.service.clientOptions(clientId);
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
  win(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<Deal> {
    return this.service.win(id, principal);
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
