import { expect, test, type APIRequestContext } from "@playwright/test";
import type { Deal, Pipeline, PipelinePeopleResponse } from "@plugga/shared";

let pipeline: Pipeline;
let negocio: Deal;

async function criar<T>(request: APIRequestContext, origin: string, url: string, data: object): Promise<T> {
  const resposta = await request.post(url, { headers: { origin }, data });
  expect(resposta.ok(), await resposta.text()).toBe(true);
  return resposta.json();
}

test.beforeAll(async ({ request, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const pessoas: PipelinePeopleResponse = await (await request.get("/api/pipelines/pessoas?companyId=plugga")).json();
  pipeline = await criar(request, baseURL!, "/api/pipelines", {
    companyId: "plugga", name: `Detalhes E2E ${Date.now()}`, description: null,
    valueLabel: "Investimento estimado", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: ["Entrada", "Qualificação"].map((name) => ({ name, color: "#0077FF", staleAfterDays: null, asksClientConversion: false })),
    tags: [{ name: "Solar", color: "#0077FF" }], lossReasons: [], members: [],
  });
  negocio = await criar(request, baseURL!, "/api/leads", {
    pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, ownerId: pessoas.people[0]!.id,
    title: "Projeto sintético", value: null, tagIds: [],
    lead: { personType: "pj", name: "Lead sintético dos detalhes", email: "detalhes@teste.local" },
  });
});

test.afterAll(async ({ request, baseURL }) => {
  if (pipeline) await criar(request, baseURL!, `/api/pipelines/${pipeline.id}/arquivar`, {});
});

test("falha de leitura oferece nova tentativa e protege rascunho entre abas e ao fechar", async ({ page }) => {
  let falhar = true;
  await page.route(`**/api/leads/${negocio.id}`, async (route) => {
    if (route.request().method() === "GET" && falhar) {
      return route.fulfill({ status: 503, json: { codigo: "SERVICO_INDISPONIVEL", mensagem: "Leitura indisponível no teste" } });
    }
    return route.continue();
  });
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  await page.getByRole("button", { name: `Ver lead ${negocio.lead.name}`, exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  await expect(modal.getByRole("alert")).toContainText("Leitura indisponível");
  falhar = false;
  await modal.getByRole("button", { name: "Tentar novamente" }).click();
  await modal.getByRole("tab", { name: "Cadastro", exact: true }).click();
  await modal.getByLabel("Nome", { exact: true }).fill("Rascunho preservado");
  await modal.getByRole("tab", { name: "Oportunidade", exact: true }).click();
  await modal.getByRole("tab", { name: "Cadastro", exact: true }).click();
  await expect(modal.getByLabel("Nome", { exact: true })).toHaveValue("Rascunho preservado");
  await modal.getByRole("button", { name: "Fechar", exact: true }).click();
  const descarte = page.getByRole("dialog", { name: "Descartar alterações?", exact: true });
  await descarte.getByRole("button", { name: "Continuar editando" }).click();
  await expect(modal.getByLabel("Nome", { exact: true })).toHaveValue("Rascunho preservado");
  await modal.getByRole("button", { name: "Fechar", exact: true }).click();
  await descarte.getByRole("button", { name: "Descartar e fechar" }).click();
  await expect(modal).toHaveCount(0);
});
