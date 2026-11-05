import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Deal, DealHistoryEntry, Pipeline, PipelinePeopleResponse } from "@plugga/shared";

let pipeline: Pipeline;
let negocio: Deal;
const notas = "Cliente solicitou uma proposta para reduzir os custos de energia. Retomar contato após a análise das faturas.";
const entradas: DealHistoryEntry[] = Array.from({ length: 30 }, (_, indice) => ({
  id: randomUUID(), kind: "created", occurredAt: new Date(Date.parse("2025-11-02T18:47:00Z") - indice * 60_000).toISOString(),
  actor: { id: randomUUID(), name: "Marina Costa" }, field: null, before: null, after: null,
  fromStageName: null, toStageName: null, fromPipelineName: null, toPipelineName: null, fromPriority: null, toPriority: null,
}));
entradas[0] = { ...entradas[0]!, kind: "field_changed", field: "lead.notes", after: notas };
entradas[1] = { ...entradas[1]!, kind: "stage_changed", fromStageName: "Entrada", toStageName: "Qualificação" };
entradas[2] = { ...entradas[2]!, kind: "priority_changed", toPriority: "urgente" };
entradas[3] = { ...entradas[3]!, kind: "document_added" };
entradas[4] = { ...entradas[4]!, actor: null };
entradas[5] = { ...entradas[5]!, kind: "field_changed", field: "expectedCloseDate", before: "2028-02-29", after: "2028-03-01" };

test.beforeAll(async ({ request, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const pessoas: PipelinePeopleResponse = await (await request.get("/api/pipelines/pessoas?companyId=plugga")).json();
  const respostaPipeline = await request.post("/api/pipelines", { headers: { origin: baseURL! }, data: {
    companyId: "plugga", name: `Histórico visual E2E ${Date.now()}`, description: null, valueLabel: "Investimento", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: ["Entrada", "Qualificação"].map((name) => ({ name, color: "#0077FF", staleAfterDays: null, asksClientConversion: false })), tags: [], lossReasons: [], members: [],
  } });
  expect(respostaPipeline.ok(), await respostaPipeline.text()).toBe(true);
  pipeline = await respostaPipeline.json();
  const respostaLead = await request.post("/api/leads", { headers: { origin: baseURL! }, data: {
    pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, ownerId: pessoas.people[0]!.id,
    title: "Histórico visual sintético", value: null, tagIds: [], lead: { personType: "pj", name: "Lead sintético do histórico", email: "historico@teste.local" },
  } });
  expect(respostaLead.ok(), await respostaLead.text()).toBe(true);
  negocio = await respostaLead.json();
});

test.afterAll(async ({ request, baseURL }) => {
  if (pipeline) await request.post(`/api/pipelines/${pipeline.id}/arquivar`, { headers: { origin: baseURL! }, data: {} });
});

test("histórico agrupa atividades, pagina sem duplicar e mantém o topo fixo em todas as abas", async ({ page }) => {
  const cursor = randomUUID();
  const anterior = { ...entradas[5]!, id: randomUUID(), occurredAt: "2025-11-01T18:00:00Z" };
  await page.route(`**/api/leads/${negocio.id}/historico?**`, (route) => route.fulfill({ json: route.request().url().includes("cursor=") ? { entries: [entradas[29], anterior], nextCursor: null } : { entries: entradas, nextCursor: cursor } }));
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&lead=${negocio.id}`);
  const modal = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  await expect(modal.getByRole("heading", { name: "Próxima ação", exact: true })).toBeVisible();
  const topo = [modal.locator("header").first(), modal.locator('[class*="proximaAcaoSuperior"]'), modal.getByRole("tablist")];
  const posicoes = await Promise.all(topo.map((elemento) => elemento.boundingBox()));
  for (const nome of ["Histórico", "Propostas", "Documentos", "Perfil", "Oportunidade", "Visão geral"]) {
    await modal.getByRole("tab", { name: nome, exact: true }).click();
    await expect(modal.getByRole("heading", { name: "Próxima ação", exact: true })).toBeVisible();
    expect(await Promise.all(topo.map((elemento) => elemento.boundingBox()))).toEqual(posicoes);
  }
  await modal.getByRole("tab", { name: "Histórico", exact: true }).click();
  const historico = modal.getByRole("region", { name: "Histórico do lead", exact: true });
  await expect(historico.getByText(notas, { exact: true })).toBeVisible();
  await expect(historico.getByRole("heading", { name: "2 de novembro de 2025", exact: true })).toBeVisible();
  await expect(historico.getByText("Urgente", { exact: true })).toBeVisible();
  await expect(historico.getByText("Autor não informado", { exact: true })).toBeVisible();
  const previsao = historico.getByRole("listitem").filter({ hasText: "Previsão de fechamento" });
  await expect(previsao.getByText("29/02/2028", { exact: true })).toBeVisible();
  await expect(previsao.getByText("01/03/2028", { exact: true })).toBeVisible();
  await expect(historico.getByRole("listitem")).toHaveCount(30);
  await historico.getByRole("button", { name: "Carregar mais atividades" }).click();
  await expect(historico.getByRole("listitem")).toHaveCount(31);
  await expect(historico.getByRole("heading", { name: "1 de novembro de 2025", exact: true })).toBeVisible();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const antes = await Promise.all(topo.map((elemento) => elemento.boundingBox()));
    const painel = modal.getByRole("tabpanel");
    const rolou = await painel.evaluate((elemento) => { elemento.scrollTop = 200; return elemento.scrollTop; });
    expect(rolou).toBeGreaterThan(0);
    expect(await Promise.all(topo.map((elemento) => elemento.boundingBox()))).toEqual(antes);
    expect(await painel.evaluate((elemento) => elemento.scrollWidth <= elemento.clientWidth)).toBe(true);
    await modal.getByRole("tab", { name: "Perfil", exact: true }).click();
    await expect.poll(() => painel.evaluate((elemento) => elemento.scrollTop)).toBe(0);
    await modal.getByRole("tab", { name: "Histórico", exact: true }).click();
  }
});

test("histórico oferece nova tentativa e estado vazio sem retirar a próxima ação", async ({ page }) => {
  let falhar = true;
  await page.route(`**/api/leads/${negocio.id}/historico?**`, (route) => {
    if (falhar) { falhar = false; return route.fulfill({ status: 503, json: { codigo: "SERVICO_INDISPONIVEL", mensagem: "Histórico indisponível no teste" } }); }
    return route.fulfill({ json: { entries: [], nextCursor: null } });
  });
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&lead=${negocio.id}`);
  const modal = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  await modal.getByRole("tab", { name: "Histórico", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("Histórico indisponível no teste");
  await expect(modal.getByText("Nenhuma atividade registrada", { exact: true })).toHaveCount(0);
  await modal.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(modal.getByRole("heading", { name: "Nenhuma atividade registrada", exact: true })).toBeVisible();
  await expect(modal.getByRole("heading", { name: "Próxima ação", exact: true })).toBeVisible();
});
