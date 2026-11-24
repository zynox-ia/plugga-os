import { expect, test, type Page } from "@playwright/test";

import { marcaDaExecucao } from "./support/execucao";
import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * Tarefas do Financeiro (PLU-340, as antigas "Rotinas do dia"), no componente
 * compartilhado com a Engenharia: a tela pelo menu, Nova tarefa, concluir com
 * resultado e evidência, o Kanban e a engrenagem das Configurações do Financeiro.
 * O que o spec cria leva a marca da execução e sai no teardown.
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.237" }, contextOptions: { reducedMotion: "reduce" } });
const DEPOIS_DA_ACAO = { timeout: 15_000 };
const EVIDENCIA = { name: "comprovante-e2e.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqGeoBwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") };
const literal = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function escolher(page: Page, dialogo: ReturnType<Page["getByRole"]>, campo: RegExp, opcao: string | RegExp) {
  await dialogo.getByRole("combobox", { name: campo }).click();
  await page.getByRole("option", { name: opcao }).first().click();
}

test("o Financeiro cria e conclui uma tarefa com evidência, e a vê no Kanban", async ({ page }) => {
  test.slow();
  await bloquearTerceiros(page);
  const titulo = `Conferir as tarifas ${marcaDaExecucao()} ${Date.now().toString(36).toUpperCase()} (sintético)`;

  // Pelo menu: "Tarefas" substituiu "Rotinas do dia".
  await page.goto("/financeiro/lancamentos");
  await page.getByRole("navigation").getByRole("button", { name: "Tarefas" }).click();
  await expect(page).toHaveURL(/\/financeiro\/tarefas/, DEPOIS_DA_ACAO);
  await expect(page.getByRole("heading", { name: "Tarefas", level: 1 })).toBeVisible();
  await expect(page.getByText(/o Financeiro precisa fazer/)).toBeVisible();

  await page.getByRole("button", { name: "Nova tarefa" }).first().click();
  const nova = page.getByRole("dialog", { name: "Nova tarefa" });
  await nova.getByLabel(/^Nome da tarefa/).fill(titulo);
  await escolher(page, nova, /^Empresa/, "Plugga");
  await escolher(page, nova, /^Responsável/, /./);
  await escolher(page, nova, /^Horário-limite/, "20:00");
  await nova.getByRole("textbox", { name: "Novo item do checklist" }).fill("Baixar o extrato (sintético)");
  await nova.getByRole("textbox", { name: "Novo item do checklist" }).press("Enter");
  await nova.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(page.locator(".aviso--sucesso")).toContainText(`Tarefa criada: ${titulo}`, DEPOIS_DA_ACAO);

  const linha = page.getByRole("row", { name: new RegExp(literal(titulo)) });
  await linha.getByRole("button", { name: `Concluir ${titulo}` }).click();
  const concluir = page.getByRole("dialog", { name: "Concluir tarefa" });
  await concluir.getByRole("checkbox", { name: "Baixar o extrato (sintético)" }).check();
  await concluir.getByLabel(/^Resultado/).fill("Tarifas lançadas (sintético)");
  await concluir.locator("input[type=file]").setInputFiles(EVIDENCIA);
  await concluir.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(page.locator(".aviso--sucesso")).toContainText(`Tarefa concluída: ${titulo}.`, DEPOIS_DA_ACAO);

  await page.getByRole("tab", { name: "Kanban" }).click();
  await expect(page.getByRole("region", { name: "Tarefas concluídas" }).getByRole("article", { name: titulo })).toBeVisible(DEPOIS_DA_ACAO);

  // A engrenagem do cabeçalho abre as Configurações do Financeiro, como em Lançamentos.
  await page.getByRole("button", { name: "Configurações do Financeiro" }).click();
  await expect(page.getByRole("dialog", { name: "Configurações do Financeiro" })).toBeVisible();
});
