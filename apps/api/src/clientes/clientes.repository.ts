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

export abstract class ClientesRepository {
  abstract list(query: ListClientsQuery): Promise<ListClientsResponse>;
  abstract get(id: string): Promise<ClientSummary>;
  abstract create(input: CreateClientRequest, principal: AuthPrincipal): Promise<CreateClientResponse>;
  abstract update(id: string, input: UpdateClientRequest, principal: AuthPrincipal): Promise<ClientSummary>;
  abstract activate(id: string, principal: AuthPrincipal): Promise<ClientSummary>;
  abstract inactivate(id: string, input: InactivateClientRequest, principal: AuthPrincipal): Promise<ClientSummary>;
  abstract duplicateCandidates(query: DuplicateCandidatesQuery): Promise<ClientDuplicateCandidatesResponse>;
  abstract ficha(id: string): Promise<ClientFicha>;
}
