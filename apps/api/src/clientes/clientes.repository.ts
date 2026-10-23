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

export abstract class ClientesRepository {
  abstract list(query: ListClientsQuery): Promise<ListClientsResponse>;
  abstract get(id: string): Promise<ClientDetail>;
  abstract create(input: CreateClientRequest, principal: AuthPrincipal): Promise<CreateClientResponse>;
  abstract update(id: string, input: UpdateClientRequest, principal: AuthPrincipal): Promise<ClientDetail>;
  abstract activate(id: string, principal: AuthPrincipal): Promise<ClientDetail>;
  abstract inactivate(id: string, input: InactivateClientRequest, principal: AuthPrincipal): Promise<ClientDetail>;
  abstract duplicateCandidates(query: DuplicateCandidatesQuery): Promise<ClientDuplicateCandidatesResponse>;
  abstract owners(): Promise<ClientOwnersResponse>;
  abstract addContact(clientId: string, input: ClientContactInput, principal: AuthPrincipal): Promise<ClientDetail>;
  abstract updateContact(clientId: string, contactId: string, input: UpdateClientContactRequest, principal: AuthPrincipal): Promise<ClientDetail>;
  abstract removeContact(clientId: string, contactId: string, principal: AuthPrincipal): Promise<ClientDetail>;
}
