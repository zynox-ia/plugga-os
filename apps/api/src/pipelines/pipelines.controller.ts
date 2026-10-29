import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  createPipelineRequestSchema,
  pipelinePeopleQuerySchema,
  updatePipelineRequestSchema,
  type CreatePipelineRequest,
  type ListPipelinesResponse,
  type Pipeline,
  type PipelinePeopleQuery,
  type PipelinePeopleResponse,
  type UpdatePipelineRequest,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Departamento, Tela } from "../core/auth/acesso.decorator";
import { AcessoGuard } from "../core/auth/acesso.guard";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { PipelinesService } from "./pipelines.service";

/**
 * Pipelines de venda (PLU-269). O papel abre a porta; quem vê e quem configura
 * cada pipeline é decidido pela empresa dele e pela equipe (pipelines.rules.ts).
 */
@Controller("pipelines")
@UseGuards(SessionAuthGuard, AcessoGuard)
@Departamento("crm")
@Tela("crm.pipelines")
export class PipelinesController {
  constructor(@Inject(PipelinesService) private readonly service: PipelinesService) {}

  @Get()
  list(@CurrentPrincipal() principal: AuthPrincipal): Promise<ListPipelinesResponse> {
    return this.service.list(principal);
  }

  /** Quem pode entrar na equipe de um pipeline da empresa. */
  @Get("pessoas")
  people(@Query(new ZodValidationPipe(pipelinePeopleQuerySchema)) query: PipelinePeopleQuery, @CurrentPrincipal() principal: AuthPrincipal): Promise<PipelinePeopleResponse> {
    return this.service.people(query, principal);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  create(@Body(new ZodValidationPipe(createPipelineRequestSchema)) input: CreatePipelineRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<Pipeline> {
    return this.service.create(input, principal);
  }

  /** Substitui a configuração inteira, com trava otimista por `updatedAt`. */
  @Put(":id")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  update(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updatePipelineRequestSchema)) input: UpdatePipelineRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<Pipeline> {
    return this.service.update(id, input, principal);
  }

  @Post(":id/arquivar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  archive(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<Pipeline> {
    return this.service.archive(id, principal);
  }

  @Post(":id/reativar")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  restore(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<Pipeline> {
    return this.service.restore(id, principal);
  }
}
