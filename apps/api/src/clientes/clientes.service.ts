import { Inject, Injectable } from "@nestjs/common";
import type {
  ClientContactInput,
  ClientDetail,
  ClientDuplicateCandidatesResponse,
  ClientOwnersResponse,
  CreateClientRequest,
  CreateClientResponse,
  DuplicateCandidatesQuery,
  InactivateClientRequest,
  ListClientsQuery,
  ListClientsResponse,
  UpdateClientContactRequest,
  UpdateClientRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { ClientesRepository } from "./clientes.repository";

@Injectable()
export class ClientesService {
  constructor(@Inject(ClientesRepository) private readonly repository: ClientesRepository) {}

  list(query: ListClientsQuery): Promise<ListClientsResponse> { return this.repository.list(query); }
  get(id: string): Promise<ClientDetail> { return this.repository.get(id); }
  create(input: CreateClientRequest, principal: AuthPrincipal): Promise<CreateClientResponse> { return this.repository.create(input, principal); }
  update(id: string, input: UpdateClientRequest, principal: AuthPrincipal): Promise<ClientDetail> { return this.repository.update(id, input, principal); }
  activate(id: string, principal: AuthPrincipal): Promise<ClientDetail> { return this.repository.activate(id, principal); }
  inactivate(id: string, input: InactivateClientRequest, principal: AuthPrincipal): Promise<ClientDetail> { return this.repository.inactivate(id, input, principal); }
  duplicateCandidates(query: DuplicateCandidatesQuery): Promise<ClientDuplicateCandidatesResponse> { return this.repository.duplicateCandidates(query); }
  owners(): Promise<ClientOwnersResponse> { return this.repository.owners(); }
  addContact(clientId: string, input: ClientContactInput, principal: AuthPrincipal): Promise<ClientDetail> { return this.repository.addContact(clientId, input, principal); }
  updateContact(clientId: string, contactId: string, input: UpdateClientContactRequest, principal: AuthPrincipal): Promise<ClientDetail> { return this.repository.updateContact(clientId, contactId, input, principal); }
  removeContact(clientId: string, contactId: string, principal: AuthPrincipal): Promise<ClientDetail> { return this.repository.removeContact(clientId, contactId, principal); }
}
