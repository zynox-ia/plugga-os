import { Inject, Injectable } from "@nestjs/common";
import type {
  ClientDuplicateCandidatesResponse,
  ClientFicha,
  ClientSummary,
  CreateClientRequest,
  CreateClientResponse,
  DuplicateCandidatesQuery,
  InactivateClientRequest,
  ListClientsQuery,
  ListClientsResponse,
  UpdateClientRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { ClientesRepository } from "./clientes.repository";

@Injectable()
export class ClientesService {
  constructor(@Inject(ClientesRepository) private readonly repository: ClientesRepository) {}

  list(query: ListClientsQuery): Promise<ListClientsResponse> { return this.repository.list(query); }
  get(id: string): Promise<ClientSummary> { return this.repository.get(id); }
  create(input: CreateClientRequest, principal: AuthPrincipal): Promise<CreateClientResponse> { return this.repository.create(input, principal); }
  update(id: string, input: UpdateClientRequest, principal: AuthPrincipal): Promise<ClientSummary> { return this.repository.update(id, input, principal); }
  activate(id: string, principal: AuthPrincipal): Promise<ClientSummary> { return this.repository.activate(id, principal); }
  inactivate(id: string, input: InactivateClientRequest, principal: AuthPrincipal): Promise<ClientSummary> { return this.repository.inactivate(id, input, principal); }
  duplicateCandidates(query: DuplicateCandidatesQuery): Promise<ClientDuplicateCandidatesResponse> { return this.repository.duplicateCandidates(query); }
  ficha(id: string): Promise<ClientFicha> { return this.repository.ficha(id); }
}
