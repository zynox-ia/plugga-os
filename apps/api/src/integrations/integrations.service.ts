import { Inject, Injectable } from "@nestjs/common";
import {
  listIntegrationsResponseSchema,
  type IntegrationMode,
  type ListIntegrationsResponse,
} from "@plugga/shared";

import { NaoEncontrado } from "../common/errors/dominio";
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

  /**
   * Troca o modo de uma integração. Fica registrado quem trocou, de qual modo
   * para qual e quando (`integrations.mode.changed`), na mesma transação da troca.
   * Ainda não há rota que chame isto: a tela de Integrações só lê.
   */
  async alterarModo(
    chave: string,
    modo: IntegrationMode,
    autorId: string,
  ): Promise<{ chave: string; de: IntegrationMode; para: IntegrationMode }> {
    const resultado = await this.repository.alterarModo(chave, modo, autorId);
    if (!resultado) throw new NaoEncontrado("Integração não encontrada.");
    return { chave, de: resultado.anterior, para: resultado.atual };
  }
}
