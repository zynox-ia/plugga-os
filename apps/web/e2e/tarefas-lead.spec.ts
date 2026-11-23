import { expect, test, type APIRequestContext } from "@playwright/test";
import type { Activity, Deal, Pipeline, PipelinePeopleResponse } from "@plugga/shared";

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
    companyId: "plugga", name: `Atividades persistentes E2E ${marca}`, description: null,
    valueLabel: "Investimento", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: [{ name: "Entrada", color: "#0077FF", staleAfterDays: null, asksClientConversion: false }], tags: [], lossReasons: [], members: [],
  });
  negocio = await criar(request, baseURL!, "/api/leads", {
    pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, ownerId: pessoas.people[0]!.id,
    title: "Negócio sintético de atividades", lead: { personType: "pj", name: `Lead de atividades ${marca}`, email: `atividade-${marca}@teste.local` },
  });
});

test.afterAll(async ({ request, baseURL }) => {
  if (pipeline) await criar(request, baseURL!, `/api/pipelines/${pipeline.id}/arquivar`, {});
});

test("atividades persistem, recusam conflito e concluem com resultado e próxima ação", async ({ page, request, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  const headers = { origin: baseURL! };
  const abrir = async () => {
    await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&lead=${negocio.id}`);
    await page.getByRole("tab", { name: "Tarefas", exact: true }).click();
    await expect(page.getByRole("button", { name: "Nova atividade", exact: true })).toBeEnabled();
  };
  await abrir();
  const lead = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  await expect(lead.getByText("Sem próxima atividade.", { exact: true })).toBeVisible();
  await lead.getByRole("button", { name: "Nova atividade", exact: true }).click();
  const nova = page.getByRole("dialog", { name: "Nova atividade", exact: true });
  await nova.getByLabel("Título da atividade", { exact: false }).fill("Conferir fatura recebida");
  await nova.getByLabel("Data e hora de início", { exact: false }).fill("2026-12-10T23:30");
  await nova.getByLabel("Notas", { exact: true }).fill("Conferir consumo e UC.");
  await expect.poll(() => page.evaluate(() => { const evento = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(evento); return evento.defaultPrevented; })).toBe(true);
  const criacao = page.waitForResponse((resposta) => resposta.request().method() === "POST" && resposta.url().endsWith("/api/atividades"));
  await nova.getByRole("button", { name: "Criar atividade", exact: true }).click();
  const respostaCriacao = await criacao;
  expect(respostaCriacao.status()).toBe(201);
  const atividade: Activity = await respostaCriacao.json();
  expect(atividade.currentRound.startsAt).toBe("2026-12-11T03:30:00.000Z");
  expect(atividade.currentRound.dueAt).toBe(atividade.currentRound.startsAt);
  await expect(nova).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => { const evento = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(evento); return evento.defaultPrevented; })).toBe(false);
  await lead.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: `Ver lead ${negocio.lead.name}`, exact: true }).click();
  await lead.getByRole("tab", { name: "Tarefas", exact: true }).click();
  let card = lead.getByRole("article", { name: "Atividade Conferir fatura recebida", exact: true });
  await expect(card).toContainText("23:30");
  await expect(lead.getByText("Conferir fatura recebida ·", { exact: false })).toBeVisible();
  await card.getByRole("button", { name: "Ações de Conferir fatura recebida", exact: true }).click();
  await page.getByRole("menuitem", { name: "Editar", exact: true }).click();
  const editar = page.getByRole("dialog", { name: "Editar atividade", exact: true });
  await editar.getByLabel("Notas", { exact: true }).fill("Rascunho preservado após conflito.");
  const externa = await request.patch(`/api/atividades/${atividade.id}`, { headers, data: { version: atividade.version, notes: "Atualização concorrente confirmada." } });
  expect(externa.status()).toBe(200);
  const conflito = page.waitForResponse((resposta) => resposta.request().method() === "PATCH" && resposta.url().endsWith(`/api/atividades/${atividade.id}`));
  await editar.getByRole("button", { name: "Salvar atividade", exact: true }).click();
  expect((await conflito).status()).toBe(409);
  await expect(editar.getByLabel("Notas", { exact: true })).toHaveValue("Rascunho preservado após conflito.");
  await expect(editar.getByRole("alert")).toContainText("recarregue");
  await editar.getByRole("button", { name: "Cancelar", exact: true }).click();
  await lead.getByRole("tab", { name: "Perfil", exact: true }).click();
  await lead.getByRole("tab", { name: "Tarefas", exact: true }).click();
  card = lead.getByRole("article", { name: "Atividade Conferir fatura recebida", exact: true });
  await expect(card).toContainText("Atualização concorrente confirmada.");
  await card.focus();
  const inicio = page.waitForResponse((resposta) => resposta.request().method() === "PATCH" && resposta.url().endsWith(`/api/atividades/${atividade.id}`));
  await page.keyboard.press("Alt+ArrowRight");
  expect((await inicio).status()).toBe(200);
  await expect(lead.getByRole("region", { name: "Em andamento", exact: true }).getByRole("article")).toHaveCount(1);
  await expect(card).toBeFocused(); await page.keyboard.press("Alt+ArrowRight");
  const concluir = page.getByRole("dialog", { name: "Concluir atividade", exact: true });
  await expect(concluir).toBeVisible();
  await concluir.getByRole("button", { name: "Concluir atividade", exact: true }).click();
  await expect(concluir).toBeVisible();
  await expect(lead.getByRole("region", { name: "Concluído", exact: true }).getByRole("article")).toHaveCount(0);
  const semResultado: Activity = await (await request.get(`/api/atividades/${atividade.id}`)).json();
  expect(semResultado.currentRound.status).toBe("doing");
  await concluir.getByLabel("Resultado e evidência", { exact: false }).fill("Conta recebida e UC conferida no documento enviado.");
  await concluir.getByLabel("Agendar a próxima atividade", { exact: true }).check();
  const proxima = concluir.getByRole("region", { name: "Próxima atividade", exact: true });
  await proxima.getByLabel("Título da atividade", { exact: false }).fill("Apresentar proposta revisada");
  await proxima.getByLabel("Data e hora de início", { exact: false }).fill("2026-12-11T10:00");
  const conclusao = page.waitForResponse((resposta) => resposta.request().method() === "POST" && resposta.url().endsWith(`/api/atividades/${atividade.id}/conclusao`));
  await concluir.getByRole("button", { name: "Concluir atividade", exact: true }).click();
  expect((await conclusao).status()).toBe(200);
  await expect(concluir).toHaveCount(0);
  await abrir();
  card = lead.getByRole("article", { name: "Atividade Conferir fatura recebida", exact: true });
  await expect(card).toContainText("Conta recebida e UC conferida");
  await expect(lead.getByRole("region", { name: "A fazer", exact: true }).getByRole("article", { name: "Atividade Apresentar proposta revisada", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Ações de Conferir fatura recebida", exact: true }).click();
  await page.getByRole("menuitem", { name: "Ver histórico", exact: true }).click();
  const historico = page.getByRole("dialog", { name: "Histórico da atividade", exact: true });
  await expect(historico.getByText("Conta recebida e UC conferida", { exact: false })).toBeVisible();
  await historico.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath("atividades-desktop.png") });
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await lead.evaluate((dialogo) => dialogo.scrollWidth <= dialogo.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("atividades-mobile.png") });
});
