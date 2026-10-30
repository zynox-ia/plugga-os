import { Inject, Injectable } from "@nestjs/common";
import type {
  CreatePipelineRequest,
  ListPipelinesResponse,
  Pipeline,
  PipelinePeopleQuery,
  PipelinePeopleResponse,
  UpdatePipelineRequest,
} from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { PipelinesRepository } from "./pipelines.repository";

@Injectable()
export class PipelinesService {
  constructor(@Inject(PipelinesRepository) private readonly repository: PipelinesRepository) {}

  list(principal: AuthPrincipal): Promise<ListPipelinesResponse> { return this.repository.list(principal); }
  people(query: PipelinePeopleQuery, principal: AuthPrincipal): Promise<PipelinePeopleResponse> { return this.repository.people(query, principal); }
  create(input: CreatePipelineRequest, principal: AuthPrincipal): Promise<Pipeline> { return this.repository.create(input, principal); }
  update(id: string, input: UpdatePipelineRequest, principal: AuthPrincipal): Promise<Pipeline> { return this.repository.update(id, input, principal); }
  archive(id: string, principal: AuthPrincipal): Promise<Pipeline> { return this.repository.archive(id, principal); }
  restore(id: string, principal: AuthPrincipal): Promise<Pipeline> { return this.repository.restore(id, principal); }
}
