import { Inject, Injectable } from "@nestjs/common";
import type {
  ClientContactInput,
  ClientDetail,
  ClientDuplicateCandidatesResponse,
  ClientOwnersResponse,
  ClientSelectionQuery,
  ClientSelectionResponse,
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

  list(query: ListClientsQuery, principal: AuthPrincipal): Promise<ListClientsResponse> { return this.repository.list(query, principal); }
  selecaoNegocio(query: ClientSelectionQuery, principal: AuthPrincipal): Promise<ClientSelectionResponse> { return this.repository.selecaoNegocio(query, principal); }
  get(id: string, principal: AuthPrincipal): Promise<ClientDetail> { return this.repository.get(id, principal); }
  create(input: CreateClientRequest, principal: AuthPrincipal): Promise<CreateClientResponse> { return this.repository.create(input, principal); }
  update(id: string, input: UpdateClientRequest, principal: AuthPrincipal): Promise<ClientDetail> { return this.repository.update(id, input, principal); }
  activate(id: string, principal: AuthPrincipal): Promise<ClientDetail> { return this.repository.activate(id, principal); }
  inactivate(id: string, input: InactivateClientRequest, principal: AuthPrincipal): Promise<ClientDetail> { return this.repository.inactivate(id, input, principal); }
  duplicateCandidates(query: DuplicateCandidatesQuery, principal: AuthPrincipal): Promise<ClientDuplicateCandidatesResponse> { return this.repository.duplicateCandidates(query, principal); }
  owners(principal: AuthPrincipal): Promise<ClientOwnersResponse> { return this.repository.owners(principal); }
  addContact(clientId: string, input: ClientContactInput, principal: AuthPrincipal): Promise<ClientDetail> { return this.repository.addContact(clientId, input, principal); }
  updateContact(clientId: string, contactId: string, input: UpdateClientContactRequest, principal: AuthPrincipal): Promise<ClientDetail> { return this.repository.updateContact(clientId, contactId, input, principal); }
  removeContact(clientId: string, contactId: string, principal: AuthPrincipal): Promise<ClientDetail> { return this.repository.removeContact(clientId, contactId, principal); }
}
