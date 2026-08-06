import { Inject, Injectable } from "@nestjs/common";
import {
  listIntegrationsResponseSchema,
  type ListIntegrationsResponse,
} from "@plugga/shared";

import { IntegrationsRepository } from "./integrations.repository";

@Injectable()
export class IntegrationsService {
  constructor(
    @Inject(IntegrationsRepository)
    private readonly repository: IntegrationsRepository,
  ) {}

  async list(): Promise<ListIntegrationsResponse> {
    const integrations = await this.repository.findAll();

    return listIntegrationsResponseSchema.parse({
      items: integrations.map((integration) => ({
        id: integration.id,
        key: integration.key,
        name: integration.name,
        mode: integration.mode,
        status: integration.status,
        lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
        lastError: integration.lastError,
        owner: integration.owner,
        updatedAt: integration.updatedAt.toISOString(),
      })),
    });
  }
}
