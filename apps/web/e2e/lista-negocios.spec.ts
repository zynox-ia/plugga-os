import { expect, test, type APIRequestContext } from "@playwright/test";
import type { CreateClientResponse, Deal, Pipeline, PipelinePeopleResponse } from "@plugga/shared";
import { paginasDaLista } from "../app/components/pipelines/paginacao-da-lista";

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
    ], tags: [], lossReasons: [{ name: "Sem interesse", asksRevisitDate: false }], members: [],
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
  await criar<Deal>(request, baseURL!, `/api/negocios/${negocios[23]!.id}/perda`, {
    lossReasonId: pipeline.lossReasons[0]!.id, revisitOn: "", note: "",
  });
});

test.afterAll(async ({ request, baseURL }) => {
  if (pipeline) await criar<Pipeline>(request, baseURL!, `/api/pipelines/${pipeline.id}/arquivar`, {});
});

test("mantém os números da paginação limitados mesmo com milhares de páginas", () => {
  expect(paginasDaLista(1, 20)).toEqual([1, 2, 3, 20]);
  expect(paginasDaLista(10, 20)).toEqual([1, 9, 10, 11, 20]);
  expect(paginasDaLista(20, 20)).toEqual([1, 18, 19, 20]);
  for (const total of [1, 5, 7, 8, 20, 10_000]) {
    for (const atual of [1, Math.ceil(total / 2), total]) {
      const numeros = paginasDaLista(atual, total);
      expect(numeros.length).toBeLessThanOrEqual(7);
      expect(numeros).toContain(atual);
      expect(numeros[0]).toBe(1);
      expect(numeros.at(-1)).toBe(total);
      expect(numeros.every((n, i) => n >= 1 && n <= total && (i === 0 || n > numeros[i - 1]!))).toBe(true);
    }
  }
});

test("pagina seis registros com primeira, última e acesso direto à página", async ({ page }) => {
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&visao=lista`);
  await expect(page.locator(".lista-negocios-card tbody tr")).toHaveCount(6);
  await expect(page.locator(".card-subtitulo")).toHaveCount(0);
  const card = page.locator(".lista-negocios-card");
  expect((await card.boundingBox())!.width).toBeCloseTo((await page.locator(".painel-quadro").boundingBox())!.width, 0);
  await expect(card).not.toHaveCSS("backdrop-filter", "none");
  await expect(page.locator(".lista-paginacao-info")).toHaveText("Mostrando 1–6 de 25 leads");
  await expect(page.getByRole("button", { name: "Primeira página", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Página anterior", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Última página", exact: true }).click();
  await expect(page.locator(".lista-paginacao-info")).toHaveText("Mostrando 25–25 de 25 leads");
  await expect(page.locator(".lista-negocios-card tbody tr")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Próxima página", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Primeira página", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Ir para página", exact: true }).fill("3");
  await page.getByRole("button", { name: "Ir", exact: true }).click();
  await expect(page.locator(".lista-paginacao-info")).toHaveText("Mostrando 13–18 de 25 leads");
  await expect(page.getByRole("button", { name: "Ir para a página 3", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("spinbutton", { name: "Ir para página", exact: true }).fill("6");
  await page.getByRole("button", { name: "Ir", exact: true }).click();
  await expect(page.locator(".lista-paginacao-info")).toHaveText("Mostrando 13–18 de 25 leads");
  expect(await page.getByRole("spinbutton", { name: "Ir para página", exact: true }).evaluate((el) => el instanceof HTMLInputElement && el.validity.rangeOverflow)).toBe(true);
  await page.getByRole("spinbutton", { name: "Ir para página", exact: true }).fill("2");
  await page.getByRole("spinbutton", { name: "Ir para página", exact: true }).press("Enter");
  await expect(page.locator(".lista-paginacao-info")).toHaveText("Mostrando 7–12 de 25 leads");
  await expect(page.getByRole("spinbutton", { name: "Ir para página", exact: true })).toBeFocused();
});

test("exibe cinco títulos e revela a seleção somente ao ativá-la", async ({ page }) => {
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&visao=lista`);
  const tabela = page.getByRole("table", { name: `Lista de leads do pipeline ${pipeline.name}` });
  await expect(tabela.getByRole("columnheader")).toHaveText(["Oportunidade", "Cliente", "Etapa", "Valor", "Ações"]);
  await expect(tabela.getByRole("checkbox")).toHaveCount(0);
  const selecionar = page.getByRole("button", { name: "Selecionar leads", exact: true });
  await selecionar.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Cancelar seleção", exact: true })).toBeFocused();
  await expect(tabela.getByRole("checkbox")).toHaveCount(7);
  const linha = tabela.locator("tbody tr").first();
  await linha.getByRole("checkbox").check();
  await expect(linha).toHaveAttribute("data-selected", "true");
  await expect(page.getByText("1 lead selecionado", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Detalhes do lead", exact: true })).toHaveCount(0);
  await expect(tabela.getByRole("checkbox", { name: "Selecionar todos os leads visíveis" })).toHaveJSProperty("indeterminate", true);
  await expect(tabela.getByRole("columnheader")).toHaveCount(5);
  await page.getByRole("button", { name: "Limpar seleção", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cancelar seleção", exact: true })).toBeFocused();
  await linha.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Cancelar seleção", exact: true }).click();
  await expect(tabela.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Ações em lote" })).toHaveCount(0);
  await selecionar.click();
  await expect(tabela.getByRole("checkbox").first()).not.toBeChecked();
  await expect(linha.getByRole("checkbox")).not.toBeChecked();
});

test("mantém a tabela e os controles contidos em telas estreitas", async ({ page }, testInfo) => {
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&visao=lista`);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const selecionar = page.getByRole("button", { name: "Selecionar leads", exact: true });
    await expect(selecionar).toBeVisible();
    const card = page.locator(".lista-negocios-card");
    const limite = await card.boundingBox();
    expect(limite!.x + limite!.width).toBeLessThanOrEqual(width + 1);
    const rodape = await page.getByRole("navigation", { name: "Paginação da lista de leads" }).boundingBox();
    expect(rodape!.x + rodape!.width).toBeLessThanOrEqual(width + 1);
    const rolagem = page.locator(".lista-negocios-card .table-wrap");
    expect(await rolagem.evaluate((el) => getComputedStyle(el).overflowX)).toBe("auto");
    await selecionar.click();
    await page.getByRole("checkbox", { name: "Selecionar todos os leads visíveis" }).check();
    const barra = page.getByRole("region", { name: "Ações em lote" });
    await expect(barra).toBeVisible();
    await expect(barra).toBeInViewport({ ratio: 1 });
    const limiteBarra = await barra.boundingBox();
    expect(limiteBarra!.x + limiteBarra!.width).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: testInfo.outputPath(`lista-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Cancelar seleção", exact: true }).click();
  }
});

test("seleciona apenas a página visível e preserva a seleção explícita de outras páginas", async ({ page }) => {
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&visao=lista`);
  const titulos = await page.locator(".lead-nome").allTextContents();
  expect(titulos).toHaveLength(6);
  const idsVisiveis = negocios.filter((n) => titulos.includes(n.title)).map((n) => n.id);
  await page.getByRole("button", { name: "Selecionar leads", exact: true }).click();
  const todos = page.getByRole("checkbox", { name: "Selecionar todos os leads visíveis" });
  await todos.check();
  await expect(page.getByText("6 leads selecionados", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Próxima página" }).click();
  await expect(todos).not.toBeChecked();
  await todos.check();
  await expect(page.getByText("12 leads selecionados", { exact: true })).toBeVisible();
  await todos.uncheck();
  await expect(page.getByText("6 leads selecionados", { exact: true })).toBeVisible();
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
  await expect(page.locator(".lead-subtitulo").getByText(/lista-cache-/)).toHaveCount(6);
  expect(chamadas.size).toBe(6);
  expect([...chamadas.values()]).toEqual(Array(6).fill(1));
});

test("volta uma página após a busca reduzir o número de páginas", async ({ page }) => {
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&visao=lista`);
  await page.getByRole("button", { name: "Ir para a página 5" }).click();
  await page.getByRole("searchbox", { name: "Buscar negócios" }).fill("Grupo");
  await expect(page.locator(".lista-paginacao-info")).toHaveText("Mostrando 13–15 de 15 leads");
  await page.getByRole("button", { name: "Página anterior" }).click();
  await expect(page.locator(".lista-paginacao-info")).toHaveText("Mostrando 7–12 de 15 leads");
});

test("negócios encerrados mantêm o menu com acesso aos detalhes e sem ações inválidas", async ({ page }) => {
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&visao=lista`);
  for (const [indice, status] of [[24, "Ganho"], [23, "Perdido"]] as const) {
    const encerrado = negocios[indice]!;
    await page.getByRole("searchbox", { name: "Buscar negócios" }).fill(encerrado.title);
    const linha = page.getByRole("row").filter({ hasText: encerrado.title });
    await expect(linha.getByText(status, { exact: true })).toBeVisible();
    await linha.getByRole("button", { name: `Ações de ${encerrado.title}`, exact: true }).click();
    const menu = page.getByRole("menu", { name: `Ações de ${encerrado.title}`, exact: true });
    await expect(menu.getByRole("menuitem")).toHaveText(["Ver detalhes do lead"]);
    await menu.getByRole("menuitem", { name: "Ver detalhes do lead", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Detalhes do lead", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await linha.getByRole("button", { name: `Ver detalhes do lead ${encerrado.title}`, exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Detalhes do lead", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("negócio aberto mantém as ações de etapa, ganho, perda e transferência", async ({ page }) => {
  const aberto = negocios[22]!;
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&visao=lista`);
  await page.getByRole("searchbox", { name: "Buscar negócios" }).fill(aberto.title);
  await page.getByRole("button", { name: `Ações de ${aberto.title}`, exact: true }).click();
  const menu = page.getByRole("menu", { name: `Ações de ${aberto.title}`, exact: true });
  await expect(menu).not.toHaveCSS("backdrop-filter", "none");
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Ver detalhes do lead", "Proposta", "Ganho", "Perdido", "Mover para outro pipeline",
  ]);
});
