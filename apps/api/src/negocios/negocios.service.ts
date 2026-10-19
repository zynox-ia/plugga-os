import { Inject, Injectable } from "@nestjs/common";
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
import { NegociosRepository } from "./negocios.repository";

@Injectable()
export class NegociosService {
  constructor(@Inject(NegociosRepository) private readonly repository: NegociosRepository) {}

  list(query: ListDealsQuery, principal: AuthPrincipal): Promise<ListDealsResponse> { return this.repository.list(query, principal); }
  clientOptions(clientId: string): Promise<DealClientOptionsResponse> { return this.repository.clientOptions(clientId); }
  create(input: CreateDealRequest, principal: AuthPrincipal): Promise<Deal> { return this.repository.create(input, principal); }
  moveStage(id: string, input: MoveDealStageRequest, principal: AuthPrincipal): Promise<Deal> { return this.repository.moveStage(id, input, principal); }
  win(id: string, principal: AuthPrincipal): Promise<Deal> { return this.repository.win(id, principal); }
  lose(id: string, input: LoseDealRequest, principal: AuthPrincipal): Promise<Deal> { return this.repository.lose(id, input, principal); }
  transfer(id: string, input: TransferDealRequest, principal: AuthPrincipal): Promise<Deal> { return this.repository.transfer(id, input, principal); }
  bulk(input: BulkDealsRequest, principal: AuthPrincipal): Promise<ListDealsResponse> { return this.repository.bulk(input, principal); }
}
