import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { Activity, ActivityHistoryResponse, CompleteActivityResponse, Deal, ListActivitiesResponse, Pipeline, PipelinePeopleResponse } from "@plugga/shared";

test.setTimeout(90_000);

// A suíte DEV usa a API persistente, com fixtures sintéticas independentes por cenário.
let pipeline: Pipeline;
let negocios: Deal[];
let responsavel: PipelinePeopleResponse["people"][number];

async function criar<T>(request: APIRequestContext, origin: string, url: string, data: object): Promise<T> {
  const resposta = await request.post(url, { headers: { origin }, data });
  expect(resposta.ok(), await resposta.text()).toBe(true);
  return resposta.json();
}
async function ler<T>(request: APIRequestContext, url: string): Promise<T> {
  const resposta = await request.get(url);
  expect(resposta.ok(), await resposta.text()).toBe(true);
  return resposta.json();
}
async function verTarefas(page: Page) {
  const lead = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  await expect(lead).toBeVisible();
  await lead.getByRole("tab", { name: "Tarefas", exact: true }).click();
  await expect(lead.getByRole("button", { name: "Nova atividade", exact: true })).toBeEnabled();
  return lead;
}
async function abrir(page: Page, negocio: Deal) {
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&lead=${negocio.id}`);
  return verTarefas(page);
}
async function criarAtividade(request: APIRequestContext, origin: string, title: string) {
  return criar<Activity>(request, origin, "/api/atividades", {
    requestId: crypto.randomUUID(), target: { kind: "deal", dealId: negocios[0]!.id }, type: "task", title,
    notes: "Registro sintético inicial.", priority: "normal", ownerId: responsavel.id,
    startsAt: "2028-03-01T14:00:00.000Z", dueAt: "2028-03-01T14:00:00.000Z",
  });
}

test.beforeAll(async ({ request, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const pessoas = await ler<PipelinePeopleResponse>(request, "/api/pipelines/pessoas?companyId=plugga");
  expect(pessoas.people.length).toBeGreaterThan(0);
  for (const pessoa of pessoas.people) expect(pessoa).not.toHaveProperty("email");
  responsavel = pessoas.people[0]!;
  pipeline = await criar(request, baseURL!, "/api/pipelines", {
    companyId: "plugga", name: `Atividades DEV E2E ${Date.now()}`, description: null,
    valueLabel: "Investimento", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: ["Entrada", "Qualificação"].map((name) => ({ name, color: "#0077FF", staleAfterDays: null, asksClientConversion: false })),
    tags: [], lossReasons: [], members: [],
  });
});
test.beforeEach(async ({ request, baseURL }) => {
  const marca = crypto.randomUUID();
  negocios = [];
  for (const numero of [1, 2]) negocios.push(await criar<Deal>(request, baseURL!, "/api/leads", {
    pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, ownerId: responsavel.id,
    title: `Negócio sintético de atividades ${numero}`, value: null, tagIds: [],
    lead: { personType: "pj", name: `Lead DEV ${numero} ${marca}`, email: `atividades-dev-${numero}-${marca}@example.test` },
  }));
});
test.afterAll(async ({ request, baseURL }) => {
  if (pipeline) await criar(request, baseURL!, `/api/pipelines/${pipeline.id}/arquivar`, {});
});

test("layout, criação, edição e teclado persistem e ficam isolados por lead", async ({ page, request }) => {
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}&lead=${negocios[0]!.id}`);
  const lead = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  // Desde o ddcc6bb o modal abre na Visão geral, e a faixa "Próxima ação" fica nas outras abas.
  await lead.getByRole("tab", { name: "Perfil", exact: true }).click();
  await expect(lead.getByText("Sem próxima atividade.", { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const topo = [lead.locator("header").first(), lead.locator('[class*="proximaAcaoSuperior"]'), lead.getByRole("tablist")];
  for (const elemento of topo) await expect(elemento).toBeVisible();
  const posicoes = await Promise.all(topo.map((elemento) => elemento.boundingBox()));
  const abas = await lead.getByRole("tab").allTextContents();
  expect(abas.indexOf("Tarefas")).toBeGreaterThanOrEqual(0);
  expect(abas.indexOf("Tarefas")).toBeLessThan(abas.indexOf("Propostas"));
  await lead.getByRole("tab", { name: "Perfil", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(lead.getByRole("tab", { name: "Tarefas", exact: true })).toBeFocused();
  await expect(lead.getByRole("tab", { name: "Tarefas", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(lead.getByRole("button", { name: "Nova atividade", exact: true })).toBeEnabled();
  expect(await Promise.all(topo.map((elemento) => elemento.boundingBox()))).toEqual(posicoes);
  await expect(lead.getByRole("heading", { name: "Próxima ação", exact: true })).toBeVisible();
  const todo = lead.getByRole("region", { name: "A fazer", exact: true });
  const doing = lead.getByRole("region", { name: "Em andamento", exact: true });
  const done = lead.getByRole("region", { name: "Concluído", exact: true });
  for (const coluna of [todo, doing, done]) {
    await expect(coluna.locator(".coluna-quantidade")).toHaveText("00");
    await expect(coluna.getByRole("article")).toHaveCount(0);
  }
  await lead.getByRole("button", { name: "Nova atividade", exact: true }).click();
  const nova = page.getByRole("dialog", { name: "Nova atividade", exact: true });
  await expect(nova).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nova).toHaveCount(0);
  const antesDeAbrir = new Date();
  await lead.getByRole("button", { name: "Nova atividade", exact: true }).click();
  const caixa = await nova.boundingBox();
  expect(caixa).not.toBeNull();
  expect(caixa!.x).toBeGreaterThanOrEqual(0);
  expect(caixa!.x + caixa!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(nova.getByRole("combobox", { name: "Status", exact: true })).toHaveCount(0);
  await expect(nova.getByLabel("Título da atividade", { exact: false })).toHaveAttribute("required", "");
  const hojeManaus = (data: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus", year: "numeric", month: "2-digit", day: "2-digit" }).format(data);
  const inicioPadrao = await nova.getByLabel("Data e hora de início", { exact: false }).inputValue();
  expect([hojeManaus(antesDeAbrir), hojeManaus(new Date())]).toContain(inicioPadrao.slice(0, 10));
  for (const nome of ["Tarefa", "Ligação", "Reunião", "Visita"]) await expect(nova.getByRole("combobox", { name: "Tipo de atividade", exact: true }).getByRole("option", { name: nome, exact: true })).toHaveCount(1);
  for (const nome of ["Normal", "Médio", "Urgente"]) await expect(nova.getByRole("combobox", { name: "Prioridade", exact: true }).getByRole("option", { name: nome, exact: true })).toHaveCount(1);
  await nova.getByLabel("Título da atividade", { exact: false }).fill("Preparar proposta DEV");
  await nova.getByRole("combobox", { name: "Responsável", exact: true }).selectOption(responsavel.id);
  await nova.getByLabel("Data e hora de início", { exact: false }).fill("2028-02-29T23:30");
  await nova.getByLabel("Prazo (opcional)", { exact: true }).fill("2028-02-28T10:00");
  await nova.getByRole("button", { name: "Criar atividade", exact: true }).click();
  await expect(nova.getByText("Erro: O prazo não pode ser anterior ao início.", { exact: true })).toBeVisible();
  await expect(todo.getByRole("article")).toHaveCount(0);
  expect((await ler<ListActivitiesResponse>(request, `/api/atividades?scope=target&dealId=${negocios[0]!.id}`)).activities).toEqual([]);
  await nova.getByLabel("Prazo (opcional)", { exact: true }).fill("2028-03-01T10:00");
  await nova.getByRole("combobox", { name: "Prioridade", exact: true }).selectOption("urgente");
  await nova.getByLabel("Notas", { exact: true }).fill("Conferir os valores com o lead sintético.");
  const cancelar = await nova.getByRole("button", { name: "Cancelar", exact: true }).boundingBox();
  const criarBotao = await nova.getByRole("button", { name: "Criar atividade", exact: true }).boundingBox();
  expect(cancelar!.x).toBeLessThan(criarBotao!.x);
  const criacao = page.waitForResponse((resposta) => resposta.request().method() === "POST" && resposta.url().endsWith("/api/atividades"));
  await nova.getByRole("button", { name: "Criar atividade", exact: true }).click();
  const respostaCriacao = await criacao;
  expect(respostaCriacao.status()).toBe(201);
  const atividade: Activity = await respostaCriacao.json();
  expect(atividade.target).toEqual({ kind: "deal", dealId: negocios[0]!.id });
  expect(atividade.currentRound).toMatchObject({ status: "todo", startsAt: "2028-03-01T03:30:00.000Z", dueAt: "2028-03-01T14:00:00.000Z" });
  await expect(nova).toHaveCount(0);
  const card = lead.getByRole("article", { name: "Atividade Preparar proposta DEV", exact: true });
  await expect(todo.getByRole("article")).toHaveCount(1);
  await expect(card).toHaveAttribute("data-atividade-id", atividade.id);
  const arrasto = page.waitForResponse((resposta) => resposta.request().method() === "PATCH" && resposta.url().endsWith(`/api/atividades/${atividade.id}`));
  await card.dragTo(doing);
  expect((await arrasto).status()).toBe(200);
  await expect(doing.getByRole("article", { name: "Atividade Preparar proposta DEV", exact: true })).toBeVisible();
  await card.focus();
  const paraFazer = page.waitForResponse((resposta) => resposta.request().method() === "PATCH" && resposta.url().endsWith(`/api/atividades/${atividade.id}`));
  await page.keyboard.press("Alt+ArrowLeft");
  expect((await paraFazer).status()).toBe(200);
  await expect(todo.getByRole("article", { name: "Atividade Preparar proposta DEV", exact: true })).toBeVisible();
  await expect(card).toBeFocused();
  const emAndamento = page.waitForResponse((resposta) => resposta.request().method() === "PATCH" && resposta.url().endsWith(`/api/atividades/${atividade.id}`));
  await page.keyboard.press("Alt+ArrowRight");
  expect((await emAndamento).status()).toBe(200);
  await expect(doing.locator(".coluna-quantidade")).toHaveText("01");
  await expect(card).toBeFocused();
  await expect(card.getByText("Conferir os valores com o lead sintético.", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Concluir Preparar proposta DEV", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Ações de Preparar proposta DEV", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Ações de Preparar proposta DEV", exact: true });
  await expect(menu.getByRole("menuitem")).toHaveText(["Voltar a fazer", "Editar", "Ver histórico"]);
  await expect(menu.getByRole("menuitem", { name: /Excluir/ })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Editar", exact: true }).click();
  const editar = page.getByRole("dialog", { name: "Editar atividade", exact: true });
  await expect(editar.getByLabel("Título da atividade", { exact: false })).toHaveValue("Preparar proposta DEV");
  await expect(editar.getByRole("combobox", { name: "Responsável", exact: true })).toHaveValue(responsavel.id);
  await expect(editar.getByRole("combobox", { name: "Prioridade", exact: true })).toHaveValue("urgente");
  await expect(editar.getByLabel("Data e hora de início", { exact: false })).toHaveValue("2028-02-29T23:30");
  await expect(editar.getByLabel("Prazo (opcional)", { exact: true })).toHaveValue("2028-03-01T10:00");
  await expect(editar.getByLabel("Notas", { exact: true })).toHaveValue("Conferir os valores com o lead sintético.");
  await editar.getByLabel("Título da atividade", { exact: false }).fill("Proposta revisada DEV");
  const edicao = page.waitForResponse((resposta) => resposta.request().method() === "PATCH" && resposta.url().endsWith(`/api/atividades/${atividade.id}`));
  await editar.getByRole("button", { name: "Salvar atividade", exact: true }).click();
  expect((await edicao).status()).toBe(200);
  await expect(editar).toHaveCount(0);
  const revisada = lead.getByRole("article", { name: "Atividade Proposta revisada DEV", exact: true });
  await expect(doing.getByRole("article", { name: "Atividade Proposta revisada DEV", exact: true })).toBeVisible();
  await lead.getByRole("tab", { name: "Propostas", exact: true }).click();
  await verTarefas(page);
  await expect(revisada).toBeVisible();
  await page.reload();
  await verTarefas(page);
  await expect(revisada).toHaveAttribute("data-atividade-id", atividade.id);
  expect(await ler<Activity>(request, `/api/atividades/${atividade.id}`)).toMatchObject({ title: "Proposta revisada DEV", priority: "urgente", currentRound: { id: atividade.currentRound.id, status: "doing" } });
  await lead.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: `Ver lead ${negocios[1]!.lead.name}`, exact: true }).click();
  await verTarefas(page);
  await expect(lead.getByRole("article")).toHaveCount(0);
  await expect(lead.getByText("Sem próxima atividade.", { exact: true })).toBeVisible();
  expect((await ler<ListActivitiesResponse>(request, `/api/atividades?scope=target&dealId=${negocios[1]!.id}`)).activities).toEqual([]);
  await lead.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: `Ver lead ${negocios[0]!.lead.name}`, exact: true }).click();
  await verTarefas(page);
  await expect(revisada).toHaveAttribute("data-atividade-id", atividade.id);
});

test("conflito preserva o rascunho e não acrescenta histórico de uma edição recusada", async ({ page, request, baseURL }) => {
  const atividade = await criarAtividade(request, baseURL!, "Conferir dados DEV");
  const lead = await abrir(page, negocios[0]!);
  let card = lead.getByRole("article", { name: "Atividade Conferir dados DEV", exact: true });
  await card.getByRole("button", { name: "Ações de Conferir dados DEV", exact: true }).click();
  await page.getByRole("menuitem", { name: "Editar", exact: true }).click();
  const editar = page.getByRole("dialog", { name: "Editar atividade", exact: true });
  await editar.getByLabel("Título da atividade", { exact: false }).fill("Meu título ainda em edição");
  await editar.getByLabel("Notas", { exact: true }).fill("Rascunho preservado após conflito.");
  const externa = await request.patch(`/api/atividades/${atividade.id}`, { headers: { origin: baseURL! }, data: { version: atividade.version, notes: "Atualização concorrente confirmada." } });
  expect(externa.status()).toBe(200);
  const concorrente: Activity = await externa.json();
  const conflito = page.waitForResponse((resposta) => resposta.request().method() === "PATCH" && resposta.url().endsWith(`/api/atividades/${atividade.id}`));
  await editar.getByRole("button", { name: "Salvar atividade", exact: true }).click();
  expect((await conflito).status()).toBe(409);
  await expect(editar.getByRole("alert")).toContainText("recarregue");
  await expect(editar.getByLabel("Título da atividade", { exact: false })).toHaveValue("Meu título ainda em edição");
  await expect(editar.getByLabel("Notas", { exact: true })).toHaveValue("Rascunho preservado após conflito.");
  expect(await ler<Activity>(request, `/api/atividades/${atividade.id}`)).toMatchObject({ version: concorrente.version, title: atividade.title, notes: "Atualização concorrente confirmada." });
  await editar.getByRole("button", { name: "Cancelar", exact: true }).click();
  await lead.getByRole("tab", { name: "Perfil", exact: true }).click();
  await lead.getByRole("tab", { name: "Tarefas", exact: true }).click();
  card = lead.getByRole("article", { name: "Atividade Conferir dados DEV", exact: true });
  await expect(card).toContainText("Atualização concorrente confirmada.");
  const entradas = await ler<ActivityHistoryResponse>(request, `/api/atividades/${atividade.id}/historico`);
  expect(entradas.entries.map((entrada) => entrada.kind)).toEqual(["created", "updated"]);
  expect(entradas.entries.map((entrada) => entrada.snapshot.version)).toEqual([atividade.version, concorrente.version]);
  expect(entradas.entries[0]!.snapshot.notes).toBe("Registro sintético inicial.");
  expect(entradas.entries[1]!.snapshot.notes).toBe("Atualização concorrente confirmada.");
  await card.getByRole("button", { name: "Ações de Conferir dados DEV", exact: true }).click();
  await page.getByRole("menuitem", { name: "Ver histórico", exact: true }).click();
  const historico = page.getByRole("dialog", { name: "Histórico da atividade", exact: true });
  await expect(historico.getByRole("listitem")).toHaveCount(2);
  await expect(historico.getByText("Criada · rodada 1", { exact: true })).toBeVisible();
  await expect(historico.getByText("Atualizada · rodada 1", { exact: true })).toBeVisible();
  await historico.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.reload();
  await verTarefas(page);
  await expect(card).toContainText("Atualização concorrente confirmada.");
  expect((await ler<ActivityHistoryResponse>(request, `/api/atividades/${atividade.id}/historico`)).entries.map((entrada) => entrada.id)).toEqual(entradas.entries.map((entrada) => entrada.id));
});

test("conclusão exige resultado, agenda próxima ação e preserva histórico após recarga", async ({ page, request, baseURL }) => {
  const atividade = await criarAtividade(request, baseURL!, "Conferir fatura DEV");
  const lead = await abrir(page, negocios[0]!);
  const card = lead.getByRole("article", { name: "Atividade Conferir fatura DEV", exact: true });
  await card.focus();
  const inicio = page.waitForResponse((resposta) => resposta.request().method() === "PATCH" && resposta.url().endsWith(`/api/atividades/${atividade.id}`));
  await page.keyboard.press("Alt+ArrowRight");
  expect((await inicio).status()).toBe(200);
  await expect(card).toBeFocused();
  await page.keyboard.press("Alt+ArrowRight");
  const concluir = page.getByRole("dialog", { name: "Concluir atividade", exact: true });
  await expect(concluir).toBeVisible();
  await expect(concluir.getByLabel("Resultado e evidência", { exact: false })).toHaveAttribute("required", "");
  await concluir.getByRole("button", { name: "Concluir atividade", exact: true }).click();
  await expect(concluir).toBeVisible();
  await expect(lead.getByRole("region", { name: "Concluído", exact: true }).getByRole("article")).toHaveCount(0);
  expect((await ler<Activity>(request, `/api/atividades/${atividade.id}`)).currentRound).toMatchObject({ status: "doing", outcome: null });
  await page.keyboard.press("Escape");
  await expect(concluir).toHaveCount(0);
  await expect(card).toBeFocused();
  await card.getByRole("button", { name: "Concluir Conferir fatura DEV", exact: true }).click();
  const resultado = "Conta sintética recebida; consumo e UC conferidos no atendimento.";
  await concluir.getByLabel("Resultado e evidência", { exact: false }).fill(resultado);
  await concluir.getByLabel("Agendar a próxima atividade", { exact: true }).check();
  const proxima = concluir.getByRole("region", { name: "Próxima atividade", exact: true });
  await proxima.getByLabel("Título da atividade", { exact: false }).fill("Confirmar próximos passos DEV");
  await proxima.getByLabel("Data e hora de início", { exact: false }).fill("2028-03-02T10:00");
  const conclusao = page.waitForResponse((resposta) => resposta.request().method() === "POST" && resposta.url().endsWith(`/api/atividades/${atividade.id}/conclusao`));
  await concluir.getByRole("button", { name: "Concluir atividade", exact: true }).click();
  const resposta = await conclusao;
  expect(resposta.status()).toBe(200);
  const concluida: CompleteActivityResponse = await resposta.json();
  expect(concluida.activity.currentRound).toMatchObject({ id: atividade.currentRound.id, status: "done", outcome: { summary: resultado, documentIds: [] } });
  expect(concluida.nextActivity).not.toBeNull();
  expect(concluida.nextActivity!.target).toEqual(atividade.target);
  expect(concluida.activity.currentRound.nextActivityId).toBe(concluida.nextActivity!.id);
  expect(concluida.nextActivity!.currentRound.dueAt).toBe(concluida.nextActivity!.currentRound.startsAt);
  await expect(concluir).toHaveCount(0);
  await expect(lead.getByRole("region", { name: "Concluído", exact: true }).getByRole("article", { name: "Atividade Conferir fatura DEV", exact: true })).toBeVisible();
  await expect(card).toBeFocused();
  await expect(card.getByRole("button", { name: "Concluir Conferir fatura DEV", exact: true })).toHaveCount(0);
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(card).toBeFocused();
  expect(await ler<Activity>(request, `/api/atividades/${atividade.id}`)).toMatchObject({ version: concluida.activity.version, currentRound: { status: "done", outcome: { summary: resultado } } });
  // Concluída, o menu só oferece o histórico: sem andamento, editar ou excluir.
  await card.getByRole("button", { name: "Ações de Conferir fatura DEV", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Ver histórico"]);
  await page.getByRole("menuitem", { name: "Ver histórico", exact: true }).click();
  const historico = page.getByRole("dialog", { name: "Histórico da atividade", exact: true });
  await expect(historico.getByText("Concluída · rodada 1", { exact: true })).toBeVisible();
  await expect(historico.getByText(resultado, { exact: true })).toBeVisible();
  const registros = await ler<ActivityHistoryResponse>(request, `/api/atividades/${atividade.id}/historico`);
  expect(registros.entries.map((entrada) => entrada.kind)).toEqual(["created", "updated", "completed"]);
  expect(registros.entries[0]!.snapshot.currentRound.outcome).toBeNull();
  expect(registros.entries[2]!.snapshot.currentRound.outcome?.summary).toBe(resultado);
  await historico.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.reload();
  await verTarefas(page);
  await expect(card).toContainText(resultado);
  await expect(lead.getByRole("region", { name: "A fazer", exact: true }).getByRole("article", { name: "Atividade Confirmar próximos passos DEV", exact: true })).toBeVisible();
  const persistidas = await ler<ListActivitiesResponse>(request, `/api/atividades?scope=target&dealId=${negocios[0]!.id}`);
  expect(persistidas.activities.map((item) => item.id).sort()).toEqual([atividade.id, concluida.nextActivity!.id].sort());
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await lead.evaluate((dialogo) => dialogo.scrollWidth <= dialogo.clientWidth + 1)).toBe(true);
  const acao = await lead.getByRole("button", { name: "Nova atividade", exact: true }).boundingBox();
  expect(acao).not.toBeNull();
  expect(acao!.x).toBeGreaterThanOrEqual(0);
  expect(acao!.x + acao!.width).toBeLessThanOrEqual(320);
});
