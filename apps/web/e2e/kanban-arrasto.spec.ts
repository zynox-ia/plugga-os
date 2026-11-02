import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import type { CreateClientResponse, Deal, Pipeline, PipelinePeopleResponse } from "@plugga/shared";

let pipeline: Pipeline;
const negocios: Deal[] = [];
async function iniciarArrasto(cartao: Locator) {
  await cartao.evaluate((el) => {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: r.x + 8, clientY: r.y + 8 }));
  });
  await expect(cartao).toHaveClass(/cartao-negocio--arrastando/);
}
async function arrastarPara(page: Page, x: number, y: number) {
  await page.evaluate(({ x, y }) => {
    document.elementFromPoint(x, y)?.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer(), clientX: x, clientY: y }));
  }, { x, y });
}
async function criar<T>(request: APIRequestContext, origin: string, caminho: string, data: object): Promise<T> {
  const resposta = await request.post(caminho, { headers: { origin }, data });
  expect(resposta.ok(), await resposta.text()).toBe(true);
  return resposta.json();
}

test.beforeAll(async ({ request, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const marca = Date.now();
  const pessoas: PipelinePeopleResponse = await (await request.get("/api/pipelines/pessoas?companyId=plugga")).json();
  pipeline = await criar<Pipeline>(request, baseURL!, "/api/pipelines", {
    companyId: "plugga", name: `Arrasto E2E ${marca}`, description: null,
    valueLabel: "Investimento", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: Array.from({ length: 7 }, (_, i) => ({ name: `Etapa ${i + 1}`, color: "#0077FF", staleAfterDays: null })),
    tags: [], lossReasons: [], members: [],
  });
  const { client } = await criar<CreateClientResponse>(request, baseURL!, "/api/clientes", {
    personType: "pj", name: `Cliente sintético arrasto ${marca}`, email: `arrasto-${marca}@teste.local`,
  });
  for (let i = 0; i < 3; i++) negocios.push(await criar<Deal>(request, baseURL!, "/api/negocios", {
    pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, clientId: client.id,
    ownerId: pessoas.people[0]!.id, title: `Lead arrasto ${i}`, value: "1000", tagIds: [],
  }));
});
test.afterAll(async ({ request, baseURL }) => {
  if (pipeline) await criar(request, baseURL!, `/api/pipelines/${pipeline.id}/arquivar`, {});
});

test("marca a inserção, reorganiza os vizinhos e cancela sem persistir", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  const corpo = page.getByRole("region", { name: "Negócios em Etapa 1", exact: true });
  const cartoes = corpo.getByRole("article");
  await expect(cartoes).toHaveCount(3);
  const primeiro = (await cartoes.nth(0).boundingBox())!;
  const ultimo = (await cartoes.nth(2).boundingBox())!;
  const nome = await cartoes.nth(0).getAttribute("aria-label");
  const mutacoes: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/etapa")) mutacoes.push(r.url()); });
  await iniciarArrasto(cartoes.nth(0));
  await arrastarPara(page, ultimo.x + ultimo.width / 2, ultimo.y + ultimo.height - 10);
  const espaco = page.getByTestId("kanban-insercao");
  await expect(espaco).toBeVisible();
  expect(await espaco.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe("dashed");
  await expect.poll(async () => (await cartoes.nth(1).boundingBox())!.y).toBeLessThan(primeiro.y + primeiro.height);
  await page.screenshot({ path: testInfo.outputPath("insercao-pontilhada.png") });
  await page.keyboard.press("Escape");
  await expect(espaco).toHaveCount(0);
  await expect(cartoes.nth(0)).toHaveAttribute("aria-label", nome!);
  expect(mutacoes).toEqual([]);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await iniciarArrasto(cartoes.nth(0));
  await arrastarPara(page, ultimo.x + ultimo.width / 2, ultimo.y + ultimo.height - 10);
  await expect(espaco).toBeVisible();
  expect(await corpo.locator("[data-cartao-id]").evaluateAll((elementos) => elementos.flatMap((el) => el.getAnimations()).length)).toBe(0);
  await page.keyboard.press("Escape");
});

test("rola nas duas bordas com ponteiro parado e restaura o scroll ao cancelar", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1000 });
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  const quadro = page.getByRole("region", { name: "Etapas do pipeline", exact: true });
  const cartao = page.getByRole("article").first();
  const origem = (await cartao.boundingBox())!;
  const bordas = (await quadro.boundingBox())!;
  await iniciarArrasto(cartao);
  await arrastarPara(page, bordas.x + bordas.width - 3, origem.y + 51);
  await expect.poll(() => quadro.evaluate((el) => el.scrollLeft)).toBeGreaterThan(300);
  await expect.poll(() => page.locator(".barra-rolagem-polegar").evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41)).toBeGreaterThan(0);
  await arrastarPara(page, bordas.x + 2, origem.y + 51);
  await expect.poll(() => quadro.evaluate((el) => el.scrollLeft)).toBeLessThan(10);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("kanban-insercao")).toHaveCount(0);
  expect(await quadro.evaluate((el) => getComputedStyle(el).scrollSnapType)).toBe("x mandatory");
});

test("solta na posição indicada sem inventar persistência de ordem e reverte falha de etapa", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  const origem = page.getByRole("region", { name: "Negócios em Etapa 1", exact: true });
  const nome = await origem.getByRole("article").first().getAttribute("aria-label");
  const cartao = page.getByRole("article", { name: nome!, exact: true });
  const ultimo = (await origem.getByRole("article").last().boundingBox())!;
  const mutacoes: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/etapa")) mutacoes.push(r.url()); });
  await iniciarArrasto(cartao);
  await arrastarPara(page, ultimo.x + ultimo.width / 2, ultimo.y + ultimo.height - 10);
  await origem.dispatchEvent("drop");
  await expect(origem.getByRole("article").last()).toHaveAttribute("aria-label", nome!);
  expect(mutacoes).toEqual([]);

  const destino = page.getByRole("region", { name: "Negócios em Etapa 2", exact: true });
  const r = (await destino.boundingBox())!;
  await page.route("**/api/negocios/*/etapa", (rota) => rota.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Falha sintética de etapa" }) }));
  await iniciarArrasto(cartao);
  await arrastarPara(page, r.x + r.width / 2, r.y + 60);
  await expect(destino.getByTestId("kanban-insercao")).toBeVisible();
  const falha = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/etapa"));
  await destino.dispatchEvent("drop");
  expect((await falha).status()).toBe(500);
  await expect(origem.getByRole("article", { name: nome!, exact: true })).toBeVisible();
  await page.unroute("**/api/negocios/*/etapa");
  await iniciarArrasto(cartao);
  await arrastarPara(page, r.x + r.width / 2, r.y + 60);
  const sucesso = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/etapa"));
  await destino.dispatchEvent("drop");
  const resposta = await sucesso;
  expect(resposta.ok()).toBe(true);
  expect((await resposta.json()).stageId).toBe(pipeline.stages[1]!.id);
  await page.reload();
  await expect(destino.getByRole("article", { name: nome!, exact: true })).toBeVisible();
});
