import { expect, test } from "@playwright/test";
import type { CreateClientResponse, Deal, Pipeline, PipelinePeopleResponse } from "@plugga/shared";

test("lista exibe dados do lead sem buscar a ficha de cada cliente", async ({ page, request, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const headers = { origin: baseURL! };
  const marca = Date.now();
  const pessoas = await (await request.get("/api/pipelines/pessoas?companyId=plugga")).json() as PipelinePeopleResponse;
  const pipelineResposta = await request.post("/api/pipelines", { headers, data: {
    companyId: "plugga", name: `Lista E2E ${marca}`, description: null, valueLabel: "Valor", color: "#0077FF",
    wonLabel: "Ganho", lostLabel: "Perdido", stages: ["Entrada", "Proposta"].map((name) => ({ name, color: "#0077FF", staleAfterDays: null })),
    tags: [], lossReasons: [], members: [],
  } });
  expect(pipelineResposta.ok()).toBeTruthy();
  const pipeline = await pipelineResposta.json() as Pipeline;
  try {
    const email = `lista-${marca}@teste.local`;
    const clienteResposta = await request.post("/api/clientes", { headers, data: { personType: "pj", name: `Lead sintético ${marca}`, email } });
    expect(clienteResposta.ok()).toBeTruthy();
    const { client } = await clienteResposta.json() as CreateClientResponse;
    const negocioResposta = await request.post("/api/negocios", { headers, data: {
      pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, clientId: client.id,
      ownerId: pessoas.people[0]!.id, title: `Negócio lista ${marca}`, value: null, expectedCloseDate: null, tagIds: [],
    } });
    expect(negocioResposta.ok()).toBeTruthy();
    const negocio = await negocioResposta.json() as Deal;
    const consultas: string[] = [];
    page.on("request", (req) => { if (/\/api\/clientes\/[\w-]+(?:\?|$)/.test(req.url())) consultas.push(req.url()); });
    await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&visao=lista`);
    const linha = page.getByRole("row").filter({ hasText: negocio.title });
    await expect(linha.getByText(email)).toBeVisible();
    await expect(linha.getByText("Local não informado")).toBeVisible();
    expect(consultas).toEqual([]);
  } finally {
    const resposta = await request.post(`/api/pipelines/${pipeline.id}/arquivar`, { headers });
    expect(resposta.ok()).toBeTruthy();
  }
});
