import { expect, test, type APIRequestContext } from "@playwright/test";
import type { Deal, Pipeline, PipelinePeopleResponse } from "@plugga/shared";

let pipeline: Pipeline;
let negocio: Deal;

async function criar<T>(request: APIRequestContext, origin: string, caminho: string, data: object): Promise<T> {
  const resposta = await request.post(caminho, { headers: { origin }, data });
  expect(resposta.ok(), await resposta.text()).toBe(true);
  return resposta.json();
}

test.beforeAll(async ({ request, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const pessoas: PipelinePeopleResponse = await (await request.get("/api/pipelines/pessoas?companyId=plugga")).json();
  const marca = Date.now();
  pipeline = await criar(request, baseURL!, "/api/pipelines", {
    companyId: "plugga", name: `Tarefas ocultas E2E ${marca}`, description: null,
    valueLabel: "Investimento", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: [{ name: "Entrada", color: "#0077FF", staleAfterDays: null, asksClientConversion: false }],
    tags: [], lossReasons: [], members: [],
  });
  negocio = await criar(request, baseURL!, "/api/leads", {
    pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, ownerId: pessoas.people[0]!.id,
    title: "Negócio sintético de produção", value: null, tagIds: [],
    lead: { personType: "pj", name: `Lead sintético ${marca}`, email: `tarefas-ocultas-${marca}@teste.local` },
  });
});

test.afterAll(async ({ request, baseURL }) => {
  if (pipeline) await criar(request, baseURL!, `/api/pipelines/${pipeline.id}/arquivar`, {});
});

test("produção não oferece tarefas temporárias pela ficha nem pela navegação por teclado", async ({ page }) => {
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&lead=${negocio.id}`);
  const modal = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole("tab")).toHaveText(["Visão geral", "Perfil", "Propostas", "Oportunidade", "Histórico", "Documentos"]);
  await expect(modal.getByRole("tab", { name: "Tarefas", exact: true })).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "Nova tarefa", exact: true })).toHaveCount(0);
  await expect(modal.locator("[data-tarefa-coluna]")).toHaveCount(0);
  await modal.getByRole("tab", { name: "Perfil", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(modal.getByRole("tab", { name: "Propostas", exact: true })).toBeFocused();
  await expect(modal.getByRole("tab", { name: "Propostas", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(modal.getByRole("tab", { name: "Documentos", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(modal.getByRole("tab", { name: "Visão geral", exact: true })).toBeFocused();
  await expect(modal.locator("[data-tarefa-coluna]")).toHaveCount(0);
});
