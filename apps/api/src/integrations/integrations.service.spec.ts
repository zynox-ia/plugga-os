import type { IntegrationMode } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import {
  IntegrationsRepository,
  type StoredIntegrationSummary,
} from "./integrations.repository";
import { IntegrationsService } from "./integrations.service";

class InMemoryIntegrationsRepository extends IntegrationsRepository {
  constructor(private readonly rows: StoredIntegrationSummary[]) {
    super();
  }

  async findAll(): Promise<StoredIntegrationSummary[]> {
    return this.rows;
  }

  async findModeByKey(key: string) {
    return this.rows.find((row) => row.key === key)?.mode ?? null;
  }

  readonly trocas: { key: string; modo: string; autorId: string }[] = [];

  async alterarModo(key: string, modo: IntegrationMode, autorId: string) {
    const row = this.rows.find((r) => r.key === key);
    if (!row) return null;
    const anterior = row.mode;
    if (anterior !== modo) {
      row.mode = modo;
      this.trocas.push({ key, modo, autorId });
    }
    return { anterior, atual: modo };
  }
}

describe("IntegrationsService", () => {
  it("returns only the framework-free integration metadata contract", async () => {
    const service = new IntegrationsService(
      new InMemoryIntegrationsRepository([
        {
          id: "00000000-0000-4000-8000-000000000301",
          key: "bitrix",
          name: "Bitrix",
          mode: "mock",
          status: "unknown",
          lastSyncAt: null,
          lastError: null,
          owner: "Operações",
          updatedAt: new Date("2026-08-06T15:00:00.000Z"),
        },
      ]),
    );

    await expect(service.list()).resolves.toEqual({
      items: [
        {
          id: "00000000-0000-4000-8000-000000000301",
          key: "bitrix",
          name: "Bitrix",
          mode: "mock",
          status: "unknown",
          lastSyncAt: null,
          lastError: null,
          owner: "Operações",
          updatedAt: "2026-08-06T15:00:00.000Z",
        },
      ],
    });
  });

  it("troca o modo e devolve de qual para qual; modo igual não registra troca", async () => {
    const repository = new InMemoryIntegrationsRepository([
      {
        id: "00000000-0000-4000-8000-000000000301",
        key: "bitrix",
        name: "Bitrix",
        mode: "mock",
        status: "unknown",
        lastSyncAt: null,
        lastError: null,
        owner: "Operações",
        updatedAt: new Date("2026-08-06T15:00:00.000Z"),
      },
    ]);
    const service = new IntegrationsService(repository);

    await expect(service.alterarModo("bitrix", "read_only", "user-1")).resolves.toEqual({
      chave: "bitrix",
      de: "mock",
      para: "read_only",
    });
    await expect(service.alterarModo("bitrix", "read_only", "user-1")).resolves.toEqual({
      chave: "bitrix",
      de: "read_only",
      para: "read_only",
    });
    expect(repository.trocas).toEqual([{ key: "bitrix", modo: "read_only", autorId: "user-1" }]);
  });

  it("recusa trocar o modo de integração que não existe", async () => {
    const service = new IntegrationsService(new InMemoryIntegrationsRepository([]));
    await expect(service.alterarModo("nao-existe", "write", "user-1")).rejects.toThrow(
      "Integração não encontrada.",
    );
  });
});
