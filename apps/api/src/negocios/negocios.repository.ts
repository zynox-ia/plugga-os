import type {
  BulkDealsRequest,
  CreateDealRequest,
  Deal,
  DealClientOptionsResponse,
  ListDealsQuery,
  ListDealsResponse,
  LoseDealRequest,
  MoveDealStageRequest,
  TransferDealRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";

export abstract class NegociosRepository {
  abstract list(query: ListDealsQuery, principal: AuthPrincipal): Promise<ListDealsResponse>;
  abstract clientOptions(clientId: string): Promise<DealClientOptionsResponse>;
  abstract create(input: CreateDealRequest, principal: AuthPrincipal): Promise<Deal>;
  abstract moveStage(id: string, input: MoveDealStageRequest, principal: AuthPrincipal): Promise<Deal>;
  abstract win(id: string, principal: AuthPrincipal): Promise<Deal>;
  abstract lose(id: string, input: LoseDealRequest, principal: AuthPrincipal): Promise<Deal>;
  abstract transfer(id: string, input: TransferDealRequest, principal: AuthPrincipal): Promise<Deal>;
  abstract bulk(input: BulkDealsRequest, principal: AuthPrincipal): Promise<ListDealsResponse>;
}
