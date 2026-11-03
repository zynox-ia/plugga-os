import { expect, test, type APIRequestContext } from "@playwright/test";
import type { Deal, Pipeline, PipelinePeopleResponse } from "@plugga/shared";

let pipeline: Pipeline;
let negocios: Deal[];
let responsavel: PipelinePeopleResponse["people"][number];

async function criar<T>(request: APIRequestContext, origin: string, url: string, data: object): Promise<T> {
  const resposta = await request.post(url, { headers: { origin }, data });
  expect(resposta.ok(), await resposta.text()).toBe(true);
  return resposta.json();
}

test.beforeAll(async ({ request, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const pessoas: PipelinePeopleResponse = await (await request.get("/api/pipelines/pessoas?companyId=plugga")).json();
  responsavel = pessoas.people.find((pessoa) => pessoa.email)!;
  pipeline = await criar(request, baseURL!, "/api/pipelines", {
    companyId: "plugga", name: `Tarefas E2E ${Date.now()}`, description: null,
    valueLabel: "Investimento", color: "#0077FF", wonLabel: "Ganho", lostLabel: "Perdido",
    stages: ["Entrada", "Qualificação"].map((name) => ({ name, color: "#0077FF", staleAfterDays: null, asksClientConversion: false })),
    tags: [], lossReasons: [], members: [],
  });
  negocios = [];
  for (const numero of [1, 2]) {
    negocios.push(await criar(request, baseURL!, "/api/leads", {
      pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, ownerId: responsavel.id,
      title: `Negócio tarefas ${numero}`, value: null, tagIds: [],
      lead: { personType: "pj", name: `Lead tarefas ${numero}`, email: `tarefas-${numero}@teste.local` },
    }));
  }
});

test.afterAll(async ({ request, baseURL }) => {
  if (pipeline) await criar(request, baseURL!, `/api/pipelines/${pipeline.id}/arquivar`, {});
});

test("tarefas permitem criar, mover, editar e excluir, isoladas por lead durante a sessão", async ({ page }) => {
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  await page.getByRole("button", { name: `Ver lead ${negocios[0]!.lead.name}`, exact: true }).click();
  const lead = page.getByRole("dialog", { name: "Detalhes do lead", exact: true });
  await expect(lead.getByRole("heading", { name: "Próxima ação", exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const topo = [lead.locator("header").first(), lead.locator('[class*="proximaAcaoSuperior"]'), lead.getByRole("tablist")];
  const posicoes = await Promise.all(topo.map((elemento) => elemento.boundingBox()));
  const abas = await lead.getByRole("tab").allTextContents();
  expect(abas.indexOf("Tarefas")).toBeGreaterThanOrEqual(0);
  expect(abas.indexOf("Tarefas")).toBeLessThan(abas.indexOf("Propostas"));
  await lead.getByRole("tab", { name: "Tarefas", exact: true }).click();
  expect(await Promise.all(topo.map((elemento) => elemento.boundingBox()))).toEqual(posicoes);
  await expect(lead.getByRole("heading", { name: "Próxima ação", exact: true })).toBeVisible();

  const todo = lead.locator('[data-tarefa-coluna="todo"]');
  const doing = lead.locator('[data-tarefa-coluna="doing"]');
  const done = lead.locator('[data-tarefa-coluna="done"]');
  for (const [coluna, nome] of [[todo, "A fazer"], [doing, "Em andamento"], [done, "Concluído"]] as const) {
    await expect(coluna.getByText(nome, { exact: true })).toBeVisible();
    await expect(coluna.locator(".coluna-quantidade")).toHaveText("00");
    await expect(lead.getByRole("button", { name: `Nova tarefa em ${nome}`, exact: true })).toBeVisible();
  }
  await lead.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  const novo = page.getByRole("dialog", { name: "Nova tarefa", exact: true });
  await expect(novo).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(novo).toHaveCount(0);
  await expect(lead).toBeVisible();
  await lead.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  expect((await novo.boundingBox())!.width).toBeCloseTo(486.4, 0);
  await expect(novo.getByText("Status", { exact: true })).toHaveCount(0);
  await expect(novo.getByLabel(/Título da tarefa/)).toHaveAttribute("required", "");
  for (const prioridade of ["Normal", "Médio", "Urgente"]) await expect(novo.getByRole("radio", { name: prioridade, exact: true })).toBeVisible();
  const datas = await page.evaluate(() => {
    const formatar = (dias: number) => {
      const data = new Date(); data.setHours(12, 0, 0, 0); data.setDate(data.getDate() + dias);
      return `${String(data.getDate()).padStart(2, "0")}/${String(data.getMonth() + 1).padStart(2, "0")}/${data.getFullYear()}`;
    };
    return { ontem: formatar(-1), hoje: formatar(0), amanha: formatar(1), depois: formatar(2) };
  });
  await expect(novo.getByLabel(/^Data de início/)).toHaveValue(datas.hoje);
  await novo.getByLabel(/Título da tarefa/).fill("Preparar proposta");
  const seletor = novo.getByRole("combobox", { name: "Responsável" });
  await seletor.click();
  const opcao = page.getByRole("option").filter({ hasText: responsavel.name }).first();
  await expect(opcao).toContainText(responsavel.email!);
  await opcao.click();
  await novo.getByLabel(/^Data de início/).fill(datas.amanha);
  await novo.getByLabel("Data de fim", { exact: true }).fill(datas.ontem);
  await novo.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  await expect(novo).toBeVisible();
  await expect(todo.getByRole("article")).toHaveCount(0);
  await novo.getByLabel("Data de fim", { exact: true }).fill(datas.depois);
  await novo.getByRole("radio", { name: "Urgente", exact: true }).check();
  await novo.getByLabel("Descrição", { exact: true }).fill("Conferir os valores com o cliente");
  const cancelar = await novo.getByRole("button", { name: "Cancelar", exact: true }).boundingBox();
  const criarBotao = await novo.getByRole("button", { name: "Criar tarefa", exact: true }).boundingBox();
  expect(cancelar!.x).toBeLessThan(criarBotao!.x);
  await novo.getByRole("button", { name: "Criar tarefa", exact: true }).click();
  const card = lead.getByRole("article", { name: "Preparar proposta", exact: true });
  await expect(todo.getByRole("article")).toHaveCount(1);
  await expect(todo.locator(".coluna-quantidade")).toHaveText("01");
  await expect(card).toHaveAttribute("data-tarefa-id", /.+/);
  await card.dragTo(doing);
  await expect(doing.getByRole("article", { name: "Preparar proposta" })).toBeVisible();
  await card.focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(todo.getByRole("article", { name: "Preparar proposta" })).toBeVisible();
  await expect(card).toBeFocused();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(card).toBeFocused();
  await expect(doing.getByRole("article", { name: "Preparar proposta" })).toBeVisible();
  await expect(doing.locator(".coluna-quantidade")).toHaveText("01");
  await card.getByRole("button", { name: "Ver detalhes da tarefa Preparar proposta" }).click();
  const detalhes = page.getByRole("dialog", { name: "Detalhes da tarefa", exact: true });
  await expect(detalhes.getByText("Conferir os valores com o cliente")).toBeVisible();
  for (const acao of ["Fechar", "Editar", "Excluir"]) await expect(detalhes.getByRole("button", { name: acao, exact: true })).toBeVisible();
  await detalhes.getByRole("button", { name: "Fechar", exact: true }).click();
  await card.getByRole("button", { name: "Ações da tarefa Preparar proposta" }).click();
  for (const acao of ["Ver detalhes", "Editar tarefa", "Excluir tarefa"]) await expect(page.getByRole("menuitem", { name: acao, exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Editar tarefa", exact: true }).click();
  const editar = page.getByRole("dialog", { name: "Editar tarefa", exact: true });
  await expect(editar.getByLabel(/Título da tarefa/)).toHaveValue("Preparar proposta");
  await expect(editar.getByRole("combobox", { name: "Responsável" })).toContainText(responsavel.name);
  await expect(editar.getByLabel(/^Data de início/)).toHaveValue(datas.amanha);
  await expect(editar.getByLabel("Data de fim", { exact: true })).toHaveValue(datas.depois);
  await expect(editar.getByRole("radio", { name: "Urgente" })).toBeChecked();
  await expect(editar.getByLabel("Descrição", { exact: true })).toHaveValue("Conferir os valores com o cliente");
  await expect(editar.getByText("Status", { exact: true })).toHaveCount(0);
  await editar.getByLabel(/Título da tarefa/).fill("Proposta revisada");
  await editar.getByRole("button", { name: "Salvar alterações" }).click();
  const editado = lead.getByRole("article", { name: "Proposta revisada" });
  await expect(doing.getByRole("article", { name: "Proposta revisada" })).toBeVisible();
  await editado.focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(done.getByRole("article", { name: "Proposta revisada" })).toBeVisible();
  await expect(editado).toBeFocused();
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(editado).toBeFocused();
  await expect(doing.getByRole("article", { name: "Proposta revisada" })).toBeVisible();

  await lead.getByRole("tab", { name: "Propostas", exact: true }).click();
  await lead.getByRole("tab", { name: "Tarefas", exact: true }).click();
  await expect(editado).toBeVisible();
  await lead.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: `Ver lead ${negocios[1]!.lead.name}`, exact: true }).click();
  await lead.getByRole("tab", { name: "Tarefas", exact: true }).click();
  await expect(lead.getByRole("article", { name: "Proposta revisada" })).toHaveCount(0);
  await lead.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: `Ver lead ${negocios[0]!.lead.name}`, exact: true }).click();
  await lead.getByRole("tab", { name: "Tarefas", exact: true }).click();
  await expect(editado).toBeVisible();
  await editado.getByRole("button", { name: "Ações da tarefa Proposta revisada" }).click();
  await page.getByRole("menuitem", { name: "Excluir tarefa", exact: true }).click();
  const excluir = page.getByRole("dialog", { name: "Excluir tarefa?", exact: true });
  await excluir.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(editado).toBeVisible();
  await editado.getByRole("button", { name: "Ações da tarefa Proposta revisada" }).click();
  await page.getByRole("menuitem", { name: "Excluir tarefa", exact: true }).click();
  await excluir.getByRole("button", { name: "Excluir tarefa", exact: true }).click();
  await expect(editado).toHaveCount(0);
  await expect(doing.locator(".coluna-quantidade")).toHaveText("00");
});
