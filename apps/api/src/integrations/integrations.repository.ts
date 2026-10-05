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

export interface ResultadoDaTrocaDeModo {
  anterior: IntegrationMode;
  atual: IntegrationMode;
}

export abstract class IntegrationsRepository {
  abstract findAll(): Promise<StoredIntegrationSummary[]>;
  /** `null` se a integração não existe. */
  abstract findModeByKey(key: string): Promise<IntegrationMode | null>;
  /**
   * Troca o modo e grava o evento `integrations.mode.changed` na MESMA transação:
   * sem auditoria não há troca. `null` se a integração não existe; modo igual ao
   * atual não muda nada e não gera evento.
   */
  abstract alterarModo(
    key: string,
    modo: IntegrationMode,
    autorId: string,
  ): Promise<ResultadoDaTrocaDeModo | null>;
}
