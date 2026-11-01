import { expect, test, type APIRequestContext } from "@playwright/test";
import type { CreateClientResponse, Deal, Pipeline, PipelinePeopleResponse } from "@plugga/shared";

test.describe.configure({ mode: "default" });

let pipeline: Pipeline;
let clientes: CreateClientResponse["client"][];
let negocios: Deal[];

async function criar<T>(request: APIRequestContext, baseURL: string, caminho: string, dados: Record<string, unknown>): Promise<T> {
  const resposta = await request.post(caminho, { headers: { origin: baseURL }, data: dados });
  expect(resposta.ok(), await resposta.text()).toBe(true);
  return resposta.json();
}

test.beforeAll(async ({ request, baseURL }) => {
  test.setTimeout(90_000);
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const marca = Date.now();
  const resposta = await request.get("/api/pipelines/pessoas?companyId=plugga");
  expect(resposta.ok()).toBe(true);
  const lista: PipelinePeopleResponse = await resposta.json();
  const ownerId = lista.people[0]!.id;
  pipeline = await criar<Pipeline>(request, baseURL!, "/api/pipelines", {
    companyId: "plugga", name: `Lista E2E ${marca}`, description: null,
    valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: [
      { name: "Entrada", color: "#0077FF", staleAfterDays: null },
      { name: "Proposta", color: "#00A3FF", staleAfterDays: null },
    ], tags: [], lossReasons: [], members: [],
  });
  clientes = [];
  for (let i = 0; i < 10; i++) {
    const { client } = await criar<CreateClientResponse>(request, baseURL!, "/api/clientes", {
      personType: "pj", name: `Cliente sintético lista ${marca} ${i}`,
      email: `lista-cache-${marca}-${i}@teste.local`,
    });
    clientes.push(client);
  }
  negocios = [];
  for (let i = 0; i < 25; i++) {
    negocios.push(await criar<Deal>(request, baseURL!, "/api/negocios", {
      pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id,
      clientId: clientes[i % clientes.length]!.id, ownerId,
      title: `${i < 15 ? "Grupo" : "Extra"} ${marca} ${String(i).padStart(2, "0")}`,
    }));
  }
  await criar<Deal>(request, baseURL!, `/api/negocios/${negocios[24]!.id}/ganho`, {});
});

test.afterAll(async ({ request, baseURL }) => {
  if (pipeline) await criar<Pipeline>(request, baseURL!, `/api/pipelines/${pipeline.id}/arquivar`, {});
});

test("seleciona apenas a página visível e preserva a seleção explícita de outras páginas", async ({ page }) => {
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&visao=lista`);
  const titulos = await page.locator(".lead-nome").allTextContents();
  expect(titulos).toHaveLength(10);
  const idsVisiveis = negocios.filter((n) => titulos.includes(n.title)).map((n) => n.id);
  const todos = page.getByRole("checkbox", { name: "Selecionar todos os leads visíveis" });
  await todos.check();
  await expect(page.getByText("10 leads selecionados", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Próxima página" }).click();
  await expect(todos).not.toBeChecked();
  await todos.check();
  await expect(page.getByText("20 leads selecionados", { exact: true })).toBeVisible();
  await todos.uncheck();
  await expect(page.getByText("10 leads selecionados", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Página anterior" }).click();
  await expect(todos).toBeChecked();

  await page.route("**/api/negocios/lote", (route) => route.fulfill({ json: { deals: [] } }));
  await page.getByRole("combobox", { name: "Ação em lote" }).selectOption("stage");
  await page.getByRole("combobox", { name: "Destino da ação" }).selectOption(pipeline.stages[1]!.id);
  const envio = page.waitForRequest((r) => new URL(r.url()).pathname === "/api/negocios/lote");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  expect((await envio).postDataJSON().dealIds.sort()).toEqual(idsVisiveis.sort());
});

test("consulta cada cliente da página uma única vez com respostas em tempos diferentes", async ({ page }) => {
  const chamadas = new Map<string, number>();
  await page.route(/\/api\/clientes\/[0-9a-f-]{36}$/, async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    chamadas.set(id, (chamadas.get(id) ?? 0) + 1);
    const indice = clientes.findIndex((cliente) => cliente.id === id);
    await new Promise((resolve) => setTimeout(resolve, 50 + indice * 40));
    await route.fulfill({ json: clientes[indice] });
  });
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&visao=lista`);
  await expect(page.locator(".lead-subtitulo").getByText(/lista-cache-/)).toHaveCount(10);
  expect(chamadas.size).toBe(10);
  expect([...chamadas.values()]).toEqual(Array(10).fill(1));
});

test("volta uma página após a busca reduzir o número de páginas", async ({ page }) => {
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&visao=lista`);
  await page.getByRole("button", { name: "Ir para a página 3" }).click();
  await page.getByRole("searchbox", { name: "Buscar negócios" }).fill("Grupo");
  await expect(page.locator(".lista-paginacao-info")).toHaveText("Mostrando 11–15 de 15 leads");
  await page.getByRole("button", { name: "Página anterior" }).click();
  await expect(page.locator(".lista-paginacao-info")).toHaveText("Mostrando 1–10 de 15 leads");
});

test("negócio encerrado mantém os detalhes sem oferecer ações que a API recusa", async ({ page }) => {
  const encerrado = negocios[24]!;
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&visao=lista`);
  await page.getByRole("searchbox", { name: "Buscar negócios" }).fill(encerrado.title);
  const linha = page.getByRole("row").filter({ hasText: encerrado.title });
  await expect(linha.getByText("Ganho", { exact: true })).toBeVisible();
  await expect(linha.getByRole("button", { name: `Ações de ${encerrado.title}`, exact: true })).toHaveCount(0);
  await linha.getByRole("button", { name: `Ver detalhes do lead ${encerrado.title}`, exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Detalhes do lead", exact: true })).toBeVisible();
});
