import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  alcancaTela, listDealHistoryQuerySchema, updateLeadRequestSchema,
  type DealDetail, type ListDealHistoryQuery, type ListDealHistoryResponse, type UpdateLeadRequest,
} from "@plugga/shared";

import { NaoEncontrado } from "../common/errors/dominio";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Authenticated } from "../core/auth/access.decorators";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { NegociosService } from "./negocios.service";

/** A existência do detalhe é ocultada com 404; o repositório relê o acesso no banco. */
@Controller("leads")
@Authenticated()
@UseGuards(SessionAuthGuard)
export class DetalhesNegocioController {
  constructor(@Inject(NegociosService) private readonly service: NegociosService) {}

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<DealDetail> {
    this.garantirTela(principal);
    return this.service.get(id, principal);
  }

  @Get(":id/historico")
  history(
    @Param("id", ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(listDealHistoryQuerySchema)) query: ListDealHistoryQuery,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ListDealHistoryResponse> {
    this.garantirTela(principal);
    return this.service.history(id, query, principal);
  }

  @Patch(":id")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLeadRequestSchema)) input: UpdateLeadRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<DealDetail> {
    this.garantirTela(principal);
    return this.service.update(id, input, principal);
  }

  private garantirTela(principal: AuthPrincipal): void {
    if (!alcancaTela(principal.acesso, "crm.pipelines")) throw new NaoEncontrado("Negócio não encontrado.");
  }
}
