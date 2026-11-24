import type {
  Activity, ActivityHistoryResponse, CompleteActivityRequest, CompleteActivityResponse, CreateActivityRequest,
  ListActivitiesQuery, ListActivitiesResponse, ListActivityHistoryQuery, UpdateActivityRequest,
} from "@plugga/shared";
import type { AuthPrincipal } from "../core/auth/auth.types";

export abstract class AtividadesRepository {
  abstract create(input: CreateActivityRequest, principal: AuthPrincipal): Promise<Activity>;
  abstract get(id: string, principal: AuthPrincipal): Promise<Activity>;
  abstract list(query: ListActivitiesQuery, principal: AuthPrincipal): Promise<ListActivitiesResponse>;
  abstract update(id: string, input: UpdateActivityRequest, principal: AuthPrincipal): Promise<Activity>;
  abstract complete(id: string, input: CompleteActivityRequest, principal: AuthPrincipal): Promise<CompleteActivityResponse>;
  abstract history(id: string, query: ListActivityHistoryQuery, principal: AuthPrincipal): Promise<ActivityHistoryResponse>;
}
