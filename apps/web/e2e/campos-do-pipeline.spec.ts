import { expect, test } from "@playwright/test";
import type { Deal, Pipeline, PipelinePeopleResponse } from "@plugga/shared";

let pipelineCriado: Pipeline | undefined;
test.afterEach(async ({ request, baseURL }) => {
  if (pipelineCriado) {
    const resposta = await request.post(`/api/pipelines/${pipelineCriado.id}/arquivar`, { headers: { origin: baseURL! } });
    expect(resposta.ok()).toBe(true);
    pipelineCriado = undefined;
  }
});

test("campos próprios persistem por tipo, aparecem no quadro e exigem confirmação com contagem atual", async ({ page, request, baseURL }) => {
  test.setTimeout(90_000);
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const headers = { origin: baseURL! };
  const pessoas: PipelinePeopleResponse = await (await request.get("/api/pipelines/pessoas?companyId=plugga")).json();
  const criacao = await request.post("/api/pipelines", { headers, data: {
    companyId: "plugga", name: `Campos E2E ${Date.now()}`, description: null, valueLabel: "Valor", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: [{ name: "Entrada", color: "#0077FF", staleAfterDays: null, asksClientConversion: false }], tags: [], lossReasons: [],
    fields: [
      { name: "Consumo", type: "number" }, { name: "Preço", type: "money" }, { name: "Data de referência", type: "date" },
      { name: "Observação específica", type: "text" }, { name: "Tipo de instalação", type: "select", options: [{ name: "Laje" }, { name: "Solo" }] },
      { name: "Autorizado", type: "boolean" }, { name: "Analista", type: "person" },
    ].map((campo) => ({ ...campo, showOnCard: true, showInList: true })),
  } });
  expect(criacao.ok()).toBe(true);
  const pipeline: Pipeline = await criacao.json();
  pipelineCriado = pipeline;
  const leitura = await request.get(`/api/pipelines?pipelineId=${pipeline.id}`);
  expect(leitura.status()).toBe(200);
  expect((await leitura.json()).pipelines.map((item: Pipeline) => item.id)).toEqual([pipeline.id]);
    const resposta = await request.post("/api/leads", { headers, data: {
      pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, ownerId: pessoas.people[0]!.id,
      title: "Campos sintéticos", lead: { personType: "pj", name: "Lead sintético dos campos", email: "campos@teste.local" },
    } });
    expect(resposta.ok()).toBe(true);
    const negocio: Deal = await resposta.json();
    await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
    await page.getByRole("button", { name: `Ver lead ${negocio.lead.name}`, exact: true }).click();
    const ficha = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
    await ficha.getByRole("tab", { name: "Oportunidade", exact: true }).click();
    await ficha.getByLabel("Consumo", { exact: true }).fill("0");
    await ficha.getByLabel("Preço", { exact: true }).fill("1234,50");
    await ficha.getByLabel("Data de referência", { exact: true }).fill("2026-11-09");
    await ficha.getByLabel("Observação específica", { exact: true }).fill("Registro sintético");
    await ficha.getByLabel("Tipo de instalação", { exact: true }).selectOption(pipeline.fields!.find((campo) => campo.type === "select")!.options[0]!.id);
    await ficha.getByLabel("Autorizado", { exact: true }).selectOption("false");
    await ficha.getByLabel("Analista", { exact: true }).selectOption(pessoas.people[0]!.id);
    await ficha.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    await expect(ficha.getByRole("status")).toHaveText("Alterações salvas.");
    await ficha.getByRole("button", { name: "Fechar", exact: true }).click();
    const cartao = page.getByRole("article", { name: `Lead ${negocio.lead.name}`, exact: true });
    await expect(cartao).toContainText("Não");
    await expect(cartao).toContainText("Laje");
    await expect(cartao).toContainText("1.234,50");
    await expect(cartao).toContainText("09/11/2026");
    await page.getByRole("link", { name: "Lista", exact: true }).click();
    await page.waitForURL(/visao=lista/);
    await expect(page.getByRole("columnheader", { name: "Consumo", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Autorizado", exact: true })).toBeVisible();
    await page.locator("summary").filter({ hasText: "Filtrar por dados" }).click();
    await page.getByLabel("Campo", { exact: true }).selectOption(pipeline.fields!.find((campo) => campo.type === "boolean")!.id);
    await page.getByLabel("Valor do filtro", { exact: true }).fill("Sim");
    await expect(page.getByRole("row").filter({ hasText: negocio.lead.name })).toHaveCount(0);
    await page.getByLabel("Valor do filtro", { exact: true }).fill("Não");
    await expect(page.getByRole("row").filter({ hasText: negocio.lead.name })).toHaveCount(1);
    await page.getByRole("button", { name: "Configurar pipelines", exact: true }).click();
    const config = page.getByRole("dialog", { name: "Configurar pipelines", exact: true });
    await config.getByRole("tab", { name: "Campos", exact: true }).click();
    await page.setViewportSize({ width: 320, height: 844 });
    const consumo = config.getByRole("region", { name: "Campo 1: Consumo", exact: true });
    await consumo.scrollIntoViewIfNeeded();
    expect(await config.evaluate((dialogo) => dialogo.scrollWidth <= dialogo.clientWidth + 1)).toBe(true);
    await config.getByRole("button", { name: "Excluir campo Consumo", exact: true }).click();
    const confirmacao = page.getByRole("dialog", { name: "Excluir campo preenchido?", exact: true });
    await expect(confirmacao).toContainText("1 negócio");
    await confirmacao.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(consumo).toBeVisible();
    await config.getByRole("button", { name: "Excluir campo Consumo", exact: true }).click();
    await confirmacao.getByRole("button", { name: "Excluir campo e valores", exact: true }).click();
    const gravacao = page.waitForResponse((resposta) => resposta.request().method() === "PUT" && resposta.url().endsWith(`/api/pipelines/${pipeline.id}`));
    await config.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    expect((await gravacao).status()).toBe(200);
    await expect(config.getByRole("status")).toHaveText("Alterações salvas.");
    const salvo: Deal = await (await request.get(`/api/leads/${negocio.id}`)).json();
    expect(salvo.customFields?.[pipeline.fields![0]!.id]).toBeUndefined();
    expect(salvo.customFields?.[pipeline.fields!.find((campo) => campo.type === "boolean")!.id]).toBe(false);
});
