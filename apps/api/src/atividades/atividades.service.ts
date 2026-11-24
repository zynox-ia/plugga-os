import { Inject, Injectable } from "@nestjs/common";
import type { CompleteActivityRequest, CreateActivityRequest, ListActivitiesQuery, ListActivityHistoryQuery, UpdateActivityRequest } from "@plugga/shared";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { AtividadesRepository } from "./atividades.repository";

@Injectable()
export class AtividadesService {
  constructor(@Inject(AtividadesRepository) private readonly repository: AtividadesRepository) {}
  create(input: CreateActivityRequest, principal: AuthPrincipal) { return this.repository.create(input, principal); }
  get(id: string, principal: AuthPrincipal) { return this.repository.get(id, principal); }
  list(query: ListActivitiesQuery, principal: AuthPrincipal) { return this.repository.list(query, principal); }
  update(id: string, input: UpdateActivityRequest, principal: AuthPrincipal) { return this.repository.update(id, input, principal); }
  complete(id: string, input: CompleteActivityRequest, principal: AuthPrincipal) { return this.repository.complete(id, input, principal); }
  history(id: string, query: ListActivityHistoryQuery, principal: AuthPrincipal) { return this.repository.history(id, query, principal); }
}
