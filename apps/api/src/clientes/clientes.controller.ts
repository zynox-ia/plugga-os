import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  createClientRequestSchema,
  duplicateCandidatesQuerySchema,
  inactivateClientRequestSchema,
  listClientsQuerySchema,
  updateClientRequestSchema,
  type ClientDuplicateCandidatesResponse,
  type ClientFicha,
  type ClientSummary,
  type CreateClientRequest,
  type CreateClientResponse,
  type DuplicateCandidatesQuery,
  type InactivateClientRequest,
  type ListClientsQuery,
  type ListClientsResponse,
  type UpdateClientRequest,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { DevAuthGuard } from "../core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { ClientesService } from "./clientes.service";

@Controller("clientes")
@UseGuards(DevAuthGuard, RolesGuard)
@Roles("comercial", "opm", "diretoria", "tech", "admin")
export class ClientesController {
  constructor(@Inject(ClientesService) private readonly service: ClientesService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listClientsQuerySchema)) query: ListClientsQuery): Promise<ListClientsResponse> {
    return this.service.list(query);
  }

  @Get("duplicates")
  duplicateCandidates(@Query(new ZodValidationPipe(duplicateCandidatesQuerySchema)) query: DuplicateCandidatesQuery): Promise<ClientDuplicateCandidatesResponse> {
    return this.service.duplicateCandidates(query);
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string): Promise<ClientSummary> {
    return this.service.get(id);
  }

  @Get(":id/ficha")
  ficha(@Param("id", ParseUUIDPipe) id: string): Promise<ClientFicha> {
    return this.service.ficha(id);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(OriginCheckGuard)
  @Roles("comercial", "admin")
  create(@Body(new ZodValidationPipe(createClientRequestSchema)) input: CreateClientRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<CreateClientResponse> {
    return this.service.create(input, principal);
  }

  @Patch(":id")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles("comercial", "admin")
  update(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateClientRequestSchema)) input: UpdateClientRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<ClientSummary> {
    return this.service.update(id, input, principal);
  }

  @Post(":id/activate")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles("comercial", "admin")
  activate(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<ClientSummary> {
    return this.service.activate(id, principal);
  }

  @Post(":id/inactivate")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard)
  @Roles("comercial", "admin")
  inactivate(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(inactivateClientRequestSchema)) input: InactivateClientRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<ClientSummary> {
    return this.service.inactivate(id, input, principal);
  }
}
