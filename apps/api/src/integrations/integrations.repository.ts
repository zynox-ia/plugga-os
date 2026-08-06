import type { IntegrationMode, IntegrationStatus } from "@plugga/shared";

export interface StoredIntegrationSummary {
  id: string;
  key: string;
  name: string;
  mode: IntegrationMode;
  status: IntegrationStatus;
  lastSyncAt: Date | null;
  lastError: string | null;
  owner: string;
  updatedAt: Date;
}

export abstract class IntegrationsRepository {
  abstract findAll(): Promise<StoredIntegrationSummary[]>;
}
