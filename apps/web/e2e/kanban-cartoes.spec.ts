import { expect, test, type APIRequestContext } from "@playwright/test";
import type { CreateClientResponse, Deal, Pipeline, PipelinePeopleResponse } from "@plugga/shared";

test.describe.configure({ mode: "default" });
let pipeline: Pipeline;
let negocio: Deal;

async function criar<T>(request: APIRequestContext, origin: string, caminho: string, data: Record<string, unknown>): Promise<T> {
  const resposta = await request.post(caminho, { headers: { origin }, data });
  expect(resposta.ok(), await resposta.text()).toBe(true);
  return resposta.json();
}

test.beforeAll(async ({ request, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const marca = Date.now();
  const resposta = await request.get("/api/pipelines/pessoas?companyId=plugga");
  expect(resposta.ok()).toBe(true);
  const pessoas: PipelinePeopleResponse = await resposta.json();
  pipeline = await criar<Pipeline>(request, baseURL!, "/api/pipelines", {
    companyId: "plugga", name: `Cartões compactos E2E ${marca}`, description: null,
    valueLabel: "Investimento estimado", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: ["Entrada", "Proposta", "Negociação", "Fechamento"].map((name) => ({ name, color: "#0077FF", staleAfterDays: null })),
    tags: [{ name: "Atendimento prioritário", color: "#0077FF" }], lossReasons: [], members: [],
  });
  const { client } = await criar<CreateClientResponse>(request, baseURL!, "/api/clientes", {
    personType: "pj", name: `Cliente sintético dos cartões ${marca}`, email: `cartoes-${marca}@teste.local`,
  });
  negocio = await criar<Deal>(request, baseURL!, "/api/negocios", {
    pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, clientId: client.id,
    ownerId: pessoas.people[0]!.id, title: "Projeto solar residencial", value: "65000", expectedCloseDate: "2099-12-31",
    tagIds: [pipeline.tags[0]!.id],
  });
});

test.afterAll(async ({ request, baseURL }) => {
  if (pipeline) await criar<Pipeline>(request, baseURL!, `/api/pipelines/${pipeline.id}/arquivar`, {});
});

test("cartão compacto preserva identificação e detalhes sem o bloco de investimento e previsão", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  const cartao = page.getByRole("article", { name: `Negócio ${negocio.title}`, exact: true });
  await expect(cartao).toBeVisible();
  await expect(cartao.getByText("Investimento estimado", { exact: true })).toHaveCount(0);
  await expect(cartao.getByText("Previsão", { exact: true })).toHaveCount(0);
  await expect(cartao.getByText(negocio.client.name, { exact: true })).toBeVisible();
  await expect(cartao.getByText(negocio.owner.name, { exact: true })).toBeVisible();
  await expect(cartao.getByText("Atendimento prioritário", { exact: true })).toBeVisible();
  await expect(cartao.getByText(/\d+d na etapa/)).toBeVisible();
  expect((await cartao.boundingBox())!.height).toBeLessThanOrEqual(240);
  expect((await cartao.boundingBox())!.width).toBeLessThanOrEqual(320);
  await expect(cartao.getByText(`PLU-${negocio.id.slice(0, 8).toUpperCase()}`, { exact: true })).toBeVisible();
  await expect(cartao.locator("time")).toHaveAttribute("datetime", negocio.createdAt);
  await expect(cartao.locator("time")).toHaveText(new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: "America/Manaus" }).format(new Date(negocio.createdAt)));
  await expect(cartao.getByText("Em aberto", { exact: true })).toBeVisible();
  await cartao.getByRole("button", { name: `Ver lead ${negocio.title}`, exact: true }).focus();
  await page.keyboard.press("Enter");
  const detalhes = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  await expect(detalhes).toBeVisible();
  await expect(detalhes.getByText("Investimento estimado", { exact: true })).toBeVisible();
  await detalhes.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(detalhes).toHaveCount(0);
});

test("prioridade é uma seleção visual e não altera o cadastro do lead", async ({ page }) => {
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  const mutacoes: string[] = [];
  page.on("request", (req) => { if (!["GET", "HEAD"].includes(req.method()) && new URL(req.url()).pathname.startsWith("/api/")) mutacoes.push(req.url()); });
  const cartao = page.getByRole("article", { name: `Negócio ${negocio.title}`, exact: true });
  const prioridade = cartao.getByRole("button", { name: `Prioridade visual de ${negocio.title}`, exact: true });
  await expect(prioridade).toContainText("Prioridade");
  await prioridade.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Escolher prioridade", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Escolher prioridade", exact: true })).toHaveCount(0);
  await expect(prioridade).toBeFocused();
  for (const label of ["Urgente", "Médio", "Normal"]) {
    await prioridade.click();
    const seletor = page.getByRole("dialog", { name: "Escolher prioridade", exact: true });
    await expect(seletor).toBeInViewport();
    await seletor.getByRole("button", { name: label, exact: true }).click();
    await expect(seletor).toHaveCount(0);
    await expect(prioridade).toBeFocused();
    await expect(prioridade).toContainText(label);
    if (label === "Urgente") {
      await expect(prioridade.locator("svg")).toHaveCount(1);
      const vermelho = await prioridade.evaluate((el) => getComputedStyle(el).getPropertyValue("--ui-danger").trim());
      await expect(prioridade.locator("svg")).toHaveAttribute("fill", "currentColor");
      expect(await prioridade.locator("svg").evaluate((el, cor) => {
        const referencia = document.createElement("span");
        referencia.style.color = cor;
        document.body.append(referencia);
        const esperado = getComputedStyle(referencia).color;
        referencia.remove();
        return getComputedStyle(el).color === esperado && getComputedStyle(el).fill === esperado && getComputedStyle(el).opacity === "1";
      }, vermelho)).toBe(true);
    }
    await expect(page.getByRole("dialog", { name: "Detalhes do lead", exact: true })).toHaveCount(0);
  }
  expect(mutacoes).toEqual([]);
  await page.reload();
  await expect(prioridade).toContainText("Prioridade");
});

test("cartão mantém conteúdo e menu contidos nas quatro larguras e preserva arraste", async ({ page }) => {
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  const cartao = page.getByRole("article", { name: `Negócio ${negocio.title}`, exact: true });
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(cartao).toBeInViewport();
    expect(await cartao.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    const prioridade = (await cartao.getByRole("button", { name: `Prioridade visual de ${negocio.title}`, exact: true }).boundingBox())!;
    const acoes = (await cartao.getByRole("button", { name: `Ações de ${negocio.title}`, exact: true }).boundingBox())!;
    expect(prioridade.x + prioridade.width).toBeLessThanOrEqual(acoes.x);
    expect(prioridade.y + prioridade.height / 2).toBeCloseTo(acoes.y + acoes.height / 2, 0);
    await cartao.getByRole("button", { name: `Ações de ${negocio.title}`, exact: true }).click();
    const menu = page.getByRole("menu", { name: `Ações de ${negocio.title}`, exact: true });
    await expect(menu).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  }
  const destino = page.getByRole("region", { name: "Negócios em Proposta", exact: true });
  const origem = (await cartao.boundingBox())!;
  const alvo = (await destino.boundingBox())!;
  await page.mouse.move(origem.x + 8, origem.y + 8);
  await page.mouse.down();
  await page.mouse.move(origem.x + 24, origem.y + 16, { steps: 5 });
  await expect(cartao).toHaveClass(/cartao-negocio--arrastando/);
  await page.mouse.move(alvo.x + alvo.width / 2, alvo.y + 60, { steps: 10 });
  await page.mouse.move(alvo.x + alvo.width / 2 + 1, alvo.y + 61);
  const persistencia = page.waitForResponse((resposta) => new URL(resposta.url()).pathname === `/api/negocios/${negocio.id}/etapa` && resposta.request().method() === "POST");
  await page.mouse.up();
  const resposta = await persistencia;
  expect(resposta.ok()).toBe(true);
  expect((await resposta.json()).stageId).toBe(pipeline.stages[1]!.id);
  await expect(destino.getByRole("article", { name: `Negócio ${negocio.title}`, exact: true })).toBeVisible();
  await page.reload();
  await expect(destino.getByRole("article", { name: `Negócio ${negocio.title}`, exact: true })).toBeVisible();
  await expect(cartao.locator("time")).toHaveAttribute("datetime", negocio.createdAt);
  await expect(cartao.getByText(`PLU-${negocio.id.slice(0, 8).toUpperCase()}`, { exact: true })).toBeVisible();
});
