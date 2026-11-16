import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  completeActivityRequestSchema, createActivityRequestSchema, listActivitiesQuerySchema, listActivityHistoryQuerySchema, updateActivityRequestSchema,
  type CompleteActivityRequest, type CreateActivityRequest, type ListActivitiesQuery, type ListActivityHistoryQuery, type UpdateActivityRequest,
} from "@plugga/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { AtividadesService } from "./atividades.service";

@Controller("atividades")
@UseGuards(SessionAuthGuard, AcessoGuard)
@Departamento("crm")
@Tela("crm.pipelines", "crm.clientes")
export class AtividadesController {
  constructor(@Inject(AtividadesService) private readonly service: AtividadesService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  create(@Body(new ZodValidationPipe(createActivityRequestSchema)) input: CreateActivityRequest, @CurrentPrincipal() principal: AuthPrincipal) {
    return this.service.create(input, principal);
  }

  @Get()
  list(@Query(new ZodValidationPipe(listActivitiesQuerySchema)) query: ListActivitiesQuery, @CurrentPrincipal() principal: AuthPrincipal) {
    return this.service.list(query, principal);
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal) { return this.service.get(id, principal); }

  @Patch(":id")
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  update(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateActivityRequestSchema)) input: UpdateActivityRequest, @CurrentPrincipal() principal: AuthPrincipal) {
    return this.service.update(id, input, principal);
  }

  @Post(":id/conclusao")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  complete(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(completeActivityRequestSchema)) input: CompleteActivityRequest, @CurrentPrincipal() principal: AuthPrincipal) {
    return this.service.complete(id, input, principal);
  }

  @Get(":id/historico")
  history(@Param("id", ParseUUIDPipe) id: string, @Query(new ZodValidationPipe(listActivityHistoryQuerySchema)) query: ListActivityHistoryQuery, @CurrentPrincipal() principal: AuthPrincipal) {
    return this.service.history(id, query, principal);
  }
}
