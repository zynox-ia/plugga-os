import { Test } from "@nestjs/testing";
import type { IntegrationMode } from "@plugga/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IntegrationGate } from "../src/integrations/integration-gate";
import { IntegrationsRepository } from "../src/integrations/integrations.repository";
import { ChaveDeLlmService } from "../src/llm/chave.service";
import { ConsumoRepository } from "../src/llm/consumo.repository";
import { OpenRouterGateway } from "../src/llm/openrouter.gateway";
import { PROCESSOS } from "../src/llm/processo";

/**
 * US6 / SC-008: com a integração em `mock`, acionar o modelo de linguagem não
 * faz NENHUMA chamada de rede, o resultado vem identificado como simulado e a
 * chamada fica registrada.
 *
 * O gateway e o gate são os de verdade, ligados pelo contêiner do Nest; só o
 * armazenamento (modo, consumo, chave) é substituído. A rede é interceptada em
 * `fetch`, a única porta de saída do gateway: se algum caminho a usasse, o
 * espião contaria.
 */
function montar(modo: IntegrationMode | null) {
  const registrado: Record<string, unknown>[] = [];
  const fetchEspiao = vi.fn(async () =>
    Response.json({
      id: "gen-1",
      model: "anthropic/claude-sonnet-4.5",
      choices: [{ message: { content: "{}" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.001 },
    }),
  );
  vi.stubGlobal("fetch", fetchEspiao);

  const compilar = Test.createTestingModule({
    providers: [
      OpenRouterGateway,
      IntegrationGate,
      {
        provide: IntegrationsRepository,
        useValue: { findModeByKey: async () => modo },
      },
      {
        provide: ConsumoRepository,
        useValue: { registrar: async (r: Record<string, unknown>) => void registrado.push(r) },
      },
      { provide: ChaveDeLlmService, useValue: { valor: async () => "sk-or-de-mentira" } },
    ],
  }).compile();

  return { compilar, fetchEspiao, registrado };
}

const PEDIDO = {
  processo: PROCESSOS.FATURA_VISAO,
  partes: [{ tipo: "texto" as const, texto: "texto sintético" }],
  referencia: "ref-sintetica",
};

describe("modelo de linguagem obedece ao modo da integração (e2e)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("em mock: 0 chamadas externas, resultado simulado e registrado", async () => {
    const { compilar, fetchEspiao, registrado } = montar("mock");
    const gateway = (await compilar).get(OpenRouterGateway);

    const resultado = await gateway.completar(PEDIDO);

    expect(fetchEspiao).toHaveBeenCalledTimes(0);
    expect(resultado).toMatchObject({ ok: true, simulado: true, texto: "" });
    expect(registrado).toHaveLength(1);
    expect(registrado[0]).toMatchObject({ modelo: "simulado", status: "ok", tokensEntrada: 0 });
  });

  it("sem registro da integração, conta como mock: 0 chamadas externas", async () => {
    const { compilar, fetchEspiao } = montar(null);
    const gateway = (await compilar).get(OpenRouterGateway);

    const resultado = await gateway.completar(PEDIDO);

    expect(fetchEspiao).toHaveBeenCalledTimes(0);
    expect(resultado).toMatchObject({ ok: true, simulado: true });
  });

  for (const modo of ["read_only", "bridge", "write"] as const) {
    it(`em ${modo}: a chamada real sai (uma vez) e o resultado não é simulado`, async () => {
      const { compilar, fetchEspiao } = montar(modo);
      const gateway = (await compilar).get(OpenRouterGateway);

      const resultado = await gateway.completar(PEDIDO);

      expect(fetchEspiao).toHaveBeenCalledTimes(1);
      expect(resultado).toMatchObject({ ok: true, simulado: false });
    });
  }
});
