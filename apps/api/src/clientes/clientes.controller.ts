import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  clientContactInputSchema,
  createClientRequestSchema,
  duplicateCandidatesQuerySchema,
  inactivateClientRequestSchema,
  listClientsQuerySchema,
  updateClientContactRequestSchema,
  updateClientRequestSchema,
  type ClientContactInput,
  type ClientDetail,
  type ClientDuplicateCandidatesResponse,
  type ClientOwnersResponse,
  type CreateClientRequest,
  type CreateClientResponse,
  type DuplicateCandidatesQuery,
  type InactivateClientRequest,
  type ListClientsQuery,
  type ListClientsResponse,
  type UpdateClientContactRequest,
  type UpdateClientRequest,
} from "@plugga/shared";

import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { CurrentPrincipal } from "../core/auth/current-principal.decorator";
import { SessionAuthGuard } from "../core/auth/session-auth.guard";
import { OriginCheckGuard } from "../core/auth/origin-check.guard";
import { Roles } from "../core/auth/roles.decorator";
import { RolesGuard } from "../core/auth/roles.guard";
import { ClientesService } from "./clientes.service";

/**
 * Cadastro único de clientes (PLU-268). Leitura para quem trabalha com clientes
 * em qualquer empresa (ADR-0013: o cadastro não tem empresa dona); escrita só
 * para comercial e admin.
 */
@Controller("clientes")
@UseGuards(SessionAuthGuard, RolesGuard)
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

  /** Quem pode ser responsável por um cliente: só id e nome. Antes de `:id`, que validaria "responsaveis" como UUID. */
  @Get("responsaveis")
  owners(): Promise<ClientOwnersResponse> {
    return this.service.owners();
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string): Promise<ClientDetail> {
    return this.service.get(id);
  }

  @Post()
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles("comercial", "admin")
  create(@Body(new ZodValidationPipe(createClientRequestSchema)) input: CreateClientRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<CreateClientResponse> {
    return this.service.create(input, principal);
  }

  @Patch(":id")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles("comercial", "admin")
  update(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateClientRequestSchema)) input: UpdateClientRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<ClientDetail> {
    return this.service.update(id, input, principal);
  }

  @Post(":id/activate")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles("comercial", "admin")
  activate(@Param("id", ParseUUIDPipe) id: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<ClientDetail> {
    return this.service.activate(id, principal);
  }

  @Post(":id/inactivate")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles("comercial", "admin")
  inactivate(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(inactivateClientRequestSchema)) input: InactivateClientRequest, @CurrentPrincipal() principal: AuthPrincipal): Promise<ClientDetail> {
    return this.service.inactivate(id, input, principal);
  }

  @Post(":id/contatos")
  @HttpCode(201)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles("comercial", "admin")
  addContact(@Param("id", ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(clientContactInputSchema)) input: ClientContactInput, @CurrentPrincipal() principal: AuthPrincipal): Promise<ClientDetail> {
    return this.service.addContact(id, input, principal);
  }

  @Patch(":id/contatos/:contatoId")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles("comercial", "admin")
  updateContact(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("contatoId", ParseUUIDPipe) contatoId: string,
    @Body(new ZodValidationPipe(updateClientContactRequestSchema)) input: UpdateClientContactRequest,
    @CurrentPrincipal() principal: AuthPrincipal,
  ): Promise<ClientDetail> {
    return this.service.updateContact(id, contatoId, input, principal);
  }

  @Delete(":id/contatos/:contatoId")
  @HttpCode(200)
  @UseGuards(OriginCheckGuard, ThrottlerGuard)
  @Roles("comercial", "admin")
  removeContact(@Param("id", ParseUUIDPipe) id: string, @Param("contatoId", ParseUUIDPipe) contatoId: string, @CurrentPrincipal() principal: AuthPrincipal): Promise<ClientDetail> {
    return this.service.removeContact(id, contatoId, principal);
  }
}
