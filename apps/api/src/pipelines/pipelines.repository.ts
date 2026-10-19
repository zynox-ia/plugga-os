import type {
  CreatePipelineRequest,
  ListPipelinesResponse,
  Pipeline,
  PipelinePeopleQuery,
  PipelinePeopleResponse,
  UpdatePipelineRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";

export abstract class PipelinesRepository {
  abstract list(principal: AuthPrincipal): Promise<ListPipelinesResponse>;
  abstract people(query: PipelinePeopleQuery, principal: AuthPrincipal): Promise<PipelinePeopleResponse>;
  abstract create(input: CreatePipelineRequest, principal: AuthPrincipal): Promise<Pipeline>;
  abstract update(id: string, input: UpdatePipelineRequest, principal: AuthPrincipal): Promise<Pipeline>;
  abstract archive(id: string, principal: AuthPrincipal): Promise<Pipeline>;
  abstract restore(id: string, principal: AuthPrincipal): Promise<Pipeline>;
}
