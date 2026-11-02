import type {
  BulkDealsRequest,
  ConvertLeadRequest,
  ConvertLeadResponse,
  CreateDealRequest,
  Deal,
  DealClientOptionsResponse,
  ListDealsQuery,
  ListDealsResponse,
  LoseDealRequest,
  MoveDealStageRequest,
  SetDealPriorityRequest,
  TransferDealRequest,
  UpdateLeadRequest,
  WinDealRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";

export abstract class NegociosRepository {
  abstract list(query: ListDealsQuery, principal: AuthPrincipal): Promise<ListDealsResponse>;
  abstract clientOptions(clientId: string): Promise<DealClientOptionsResponse>;
  abstract create(input: CreateDealRequest, principal: AuthPrincipal): Promise<Deal>;
  abstract update(id: string, input: UpdateLeadRequest, principal: AuthPrincipal): Promise<Deal>;
  abstract convert(id: string, input: ConvertLeadRequest, principal: AuthPrincipal): Promise<ConvertLeadResponse>;
  abstract moveStage(id: string, input: MoveDealStageRequest, principal: AuthPrincipal): Promise<Deal>;
  abstract setPriority(id: string, input: SetDealPriorityRequest, principal: AuthPrincipal): Promise<Deal>;
  abstract win(id: string, input: WinDealRequest, principal: AuthPrincipal): Promise<Deal>;
  abstract lose(id: string, input: LoseDealRequest, principal: AuthPrincipal): Promise<Deal>;
  abstract transfer(id: string, input: TransferDealRequest, principal: AuthPrincipal): Promise<Deal>;
  abstract bulk(input: BulkDealsRequest, principal: AuthPrincipal): Promise<ListDealsResponse>;
}
