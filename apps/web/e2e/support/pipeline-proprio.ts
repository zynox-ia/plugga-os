import { expect, type APIRequestContext } from "@playwright/test";
import type { Pipeline } from "@plugga/shared";

/**
 * Um pipeline só do teste, sem equipe. O seed não cria pipeline, e os que outros
 * specs criam são arquivados no fim de cada um: um teste que pega "o primeiro
 * pipeline ativo" depende da ordem da suíte (a CI 45284423247 rodou dois deles
 * com todos os 19 arquivados). `arquivar` devolve o banco como estava.
 */
export async function criarPipelineProprio(request: APIRequestContext, baseURL: string, nome: string): Promise<{ pipeline: Pipeline; arquivar: () => Promise<void> }> {
  const headers = { origin: new URL(baseURL).origin };
  const resposta = await request.post("/api/pipelines", { headers, data: {
    companyId: "plugga", name: nome, description: null,
    valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: [
      { name: "Entrada", color: "#0077FF", staleAfterDays: null, asksClientConversion: false },
      { name: "Proposta", color: "#00A3FF", staleAfterDays: null, asksClientConversion: false },
    ], tags: [], lossReasons: [{ name: "Sem interesse", asksRevisitDate: false }], members: [],
  } });
  expect(resposta.ok(), await resposta.text()).toBe(true);
  const pipeline = (await resposta.json()) as Pipeline;
  return {
    pipeline,
    arquivar: async () => {
      const arquivo = await request.post(`/api/pipelines/${pipeline.id}/arquivar`, { headers, data: {} });
      expect(arquivo.ok(), await arquivo.text()).toBe(true);
    },
  };
}
