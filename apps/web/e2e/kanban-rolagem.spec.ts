import { expect, test } from "@playwright/test";
import type { Pipeline } from "@plugga/shared";

const pipelines: Pipeline[] = [];

test.beforeAll(async ({ request, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  for (const quantidade of [4, 2]) {
    const resposta = await request.post("/api/pipelines", {
      headers: { origin: baseURL! },
      data: {
        companyId: "plugga", name: `Rolagem ${quantidade} E2E ${Date.now()}`, description: null,
        valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
        stages: Array.from({ length: quantidade }, (_, i) => ({ name: `Etapa ${i + 1}`, color: "#0077FF", staleAfterDays: null })),
        tags: [], lossReasons: [], members: [],
      },
    });
    expect(resposta.ok(), await resposta.text()).toBe(true);
    pipelines.push(await resposta.json());
  }
});

test.afterAll(async ({ request, baseURL }) => {
  for (const pipeline of pipelines) {
    const resposta = await request.post(`/api/pipelines/${pipeline.id}/arquivar`, { headers: { origin: baseURL! } });
    expect(resposta.ok()).toBe(true);
  }
});

test("barra ocupa o centro da navegação e mantém clique, arraste e sincronização", async ({ page }) => {
  const pipeline = pipelines[0]!;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  const barra = page.locator(".barra-rolagem-externa");
  const trilho = page.locator(".barra-rolagem-trilho");
  const polegar = page.locator(".barra-rolagem-polegar");
  const colunas = page.getByRole("region", { name: "Etapas do pipeline", exact: true });
  await expect(barra).toBeVisible();
  const visoes = (await page.getByRole("navigation", { name: "Visualização dos negócios" }).boundingBox())!;
  const configurar = (await page.getByRole("button", { name: "Configurar pipelines", exact: true }).boundingBox())!;
  const posicao = (await barra.boundingBox())!;
  expect(posicao.y + posicao.height / 2).toBeCloseTo(visoes.y + visoes.height / 2, 0);
  expect(posicao.y + posicao.height / 2).toBeCloseTo(configurar.y + configurar.height / 2, 0);
  expect(posicao.x).toBeGreaterThanOrEqual(visoes.x + visoes.width);
  expect(posicao.x + posicao.width).toBeLessThanOrEqual(configurar.x);
  await expect(page.locator(".quadro-pipeline .barra-rolagem-externa")).toHaveCount(0);

  const area = (await trilho.boundingBox())!;
  await trilho.click({ position: { x: area.width - 2, y: area.height / 2 } });
  await expect.poll(() => colunas.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const alca = (await polegar.boundingBox())!;
  await page.mouse.move(alca.x + alca.width / 2, alca.y + alca.height / 2);
  await page.mouse.down();
  await page.mouse.move(area.x - 10, alca.y + alca.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => colunas.evaluate((el) => el.scrollLeft)).toBeLessThan(4);

  await page.setViewportSize({ width: 3840, height: 1000 });
  await expect(barra).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(barra).toBeVisible();
  await expect.poll(async () => {
    const rail = (await trilho.boundingBox())!;
    const thumb = (await polegar.boundingBox())!;
    return thumb.x >= rail.x - 1 && thumb.x + thumb.width <= rail.x + rail.width + 1;
  }).toBe(true);

  await page.getByRole("combobox", { name: "Selecionar pipeline", exact: true }).selectOption(pipelines[1]!.id);
  await expect(barra).toBeHidden();
  await page.getByRole("combobox", { name: "Selecionar pipeline", exact: true }).selectOption(pipeline.id);
  await expect(barra).toBeVisible();
  await page.getByRole("link", { name: "Lista", exact: true }).click();
  await expect(barra).toHaveCount(0);
  await page.getByRole("link", { name: "Kanban", exact: true }).click();
  await expect(barra).toBeVisible();

  for (const width of [768, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const caixa = (await barra.boundingBox())!;
    expect(caixa.x).toBeGreaterThanOrEqual(0);
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(width + 1);
    expect(caixa.height).toBeLessThanOrEqual(28);
  }
});
