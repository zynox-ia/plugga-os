import { expect, test, type Page } from "@playwright/test";

import { diasDaRecorrenciaDoE2e } from "./support/dias-da-recorrencia";
import { marcaDaExecucao } from "./support/execucao";
import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * Tarefas da Engenharia (PLU-349), no componente compartilhado com o Financeiro:
 * Nova tarefa única com checklist, concluir com resultado e evidência, ver o que
 * foi feito, recorrente com a prévia das próximas ocorrências e encerrar.
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.215" }, contextOptions: { reducedMotion: "reduce" } });
const DEPOIS_DA_ACAO = { timeout: 15_000 };
const EVIDENCIA = { name: "print-e2e.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqGeoBwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") };
const literal = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function escolher(page: Page, dialogo: ReturnType<Page["getByRole"]>, campo: RegExp, opcao: string | RegExp) {
  await dialogo.getByRole("combobox", { name: campo }).click();
  await page.getByRole("option", { name: opcao }).first().click();
}

test("tarefa única: cria com checklist, conclui com resultado e evidência e mostra o que foi feito", async ({ page }) => {
  test.slow();
  await bloquearTerceiros(page);
  const sufixo = Date.now().toString(36).toUpperCase();
  const titulo = `Conferir usinas ${marcaDaExecucao()} ${sufixo} (sintético)`;

  await page.goto("/engenharia/tarefas");
  await expect(page.getByRole("heading", { name: "Tarefas", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Nova tarefa" }).first().click();
  const nova = page.getByRole("dialog", { name: "Nova tarefa" });
  await nova.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(nova.getByText("Erro: dê um nome à tarefa.")).toBeVisible();
  await expect(nova.getByText("Erro: escolha a empresa.")).toBeVisible();

  await nova.getByLabel(/^Nome da tarefa/).fill(titulo);
  await escolher(page, nova, /^Empresa/, "Waze Energia");
  await escolher(page, nova, /^Responsável/, /./);
  await escolher(page, nova, /^Horário-limite/, "20:00");
  // Única, para hoje: a prévia mostra o dia.
  await expect(nova.getByText("hoje · 20:00")).toBeVisible();
  for (const item of ["Exportar a geração (sintético)", "Anexar o print (sintético)"]) {
    await nova.getByRole("textbox", { name: "Novo item do checklist" }).fill(item);
    await nova.getByRole("textbox", { name: "Novo item do checklist" }).press("Enter");
  }
  await expect(nova.getByRole("button", { name: "Tirar o item Anexar o print (sintético)" })).toBeVisible();
  await nova.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(page.locator(".aviso--sucesso")).toContainText(`Tarefa criada: ${titulo}`, DEPOIS_DA_ACAO);

  // Concluir: sem resultado e sem evidência, não vai.
  const linha = page.getByRole("row", { name: new RegExp(literal(titulo)) });
  await linha.getByRole("button", { name: `Concluir ${titulo}` }).click();
  const concluir = page.getByRole("dialog", { name: "Concluir tarefa" });
  await concluir.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(concluir.getByText("Erro: descreva o resultado.")).toBeVisible();
  await expect(concluir.getByText("Erro: anexe a evidência (PDF, JPG ou PNG).")).toBeVisible();
  await concluir.getByRole("checkbox", { name: "Exportar a geração (sintético)" }).check();
  await concluir.getByLabel(/^Resultado/).fill("Geração conferida (sintético)");
  await concluir.locator("input[type=file]").setInputFiles(EVIDENCIA);
  await concluir.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(page.locator(".aviso--sucesso")).toContainText(`Tarefa concluída: ${titulo}.`, DEPOIS_DA_ACAO);
  await expect(linha).toContainText("Concluída");

  // Ver o que foi feito: resultado, checklist e a evidência.
  await linha.getByRole("button", { name: `Ver o que foi feito em ${titulo}` }).click();
  const detalhe = page.getByRole("dialog", { name: titulo });
  await expect(detalhe.getByText("Geração conferida (sintético)")).toBeVisible(DEPOIS_DA_ACAO);
  await expect(detalhe.getByRole("link", { name: "print-e2e.png" })).toBeVisible();
  await expect(detalhe.getByText("Feito: Exportar a geração (sintético)")).toBeAttached();
  await detalhe.getByRole("button", { name: "Fechar", exact: true }).first().click();

  // No Kanban, ela está em Concluídas.
  await page.getByRole("tab", { name: "Kanban" }).click();
  await expect(page.getByRole("region", { name: "Tarefas concluídas" }).getByRole("article", { name: titulo })).toBeVisible(DEPOIS_DA_ACAO);
});

test("tarefa recorrente: prévia das próximas ocorrências, cria e encerra com motivo", async ({ page }) => {
  test.slow();
  await bloquearTerceiros(page);
  const sufixo = Date.now().toString(36).toUpperCase();
  const titulo = `Relatório semanal ${marcaDaExecucao()} ${sufixo} (sintético)`;

  await page.goto("/engenharia/tarefas?periodo=todas");
  await page.getByRole("button", { name: "Nova tarefa" }).first().click();
  const nova = page.getByRole("dialog", { name: "Nova tarefa" });
  await nova.getByLabel(/^Nome da tarefa/).fill(titulo);
  await escolher(page, nova, /^Empresa/, "Plugga e Waze");
  await escolher(page, nova, /^Responsável/, /./);
  await escolher(page, nova, /^Tipo/, /^Recorrente/);
  await escolher(page, nova, /^Recorrência/, "Dias da semana");
  await nova.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(nova.getByText("Erro: escolha ao menos um dia.")).toBeVisible();
  await expect(nova.getByText("Complete a recorrência para ver as datas.")).toBeVisible();
  // Os dias pelo dia em que roda: num dia útil, hoje e o próximo, para nascer a ocorrência de hoje.
  const recorrencia = diasDaRecorrenciaDoE2e(new Date());
  for (const dia of recorrencia.dias) await nova.getByRole("button", { name: dia, exact: true }).click();
  for (const dia of recorrencia.dias) await expect(nova.getByRole("button", { name: dia, exact: true })).toHaveAttribute("aria-pressed", "true");
  // Cinco próximas, só nos dias marcados.
  const previa = nova.locator("[aria-live=polite]");
  await expect(previa.getByText(/· 18:00$/)).toHaveCount(5);
  const dosDias = new RegExp(`^(hoje|amanhã|${recorrencia.dias.map(literal).join("|")})`);
  for (const texto of await previa.getByText(/· 18:00$/).allInnerTexts()) expect(texto).toMatch(dosDias);
  await nova.getByRole("button", { name: "Criar tarefa" }).click();
  await expect(page.locator(".aviso--sucesso")).toContainText(`Tarefa criada: ${titulo} (${recorrencia.texto}, até 18:00).`, DEPOIS_DA_ACAO);

  if (!recorrencia.apareceNestaSemana) {
    // Sábado e domingo: o seletor só tem dias úteis e a geração vai até o domingo, então a tarefa
    // ainda não tem ocorrência nem botão na lista (dúvida de produto aberta). A limpeza da execução a apaga.
    test.info().annotations.push({ type: "fim de semana", description: "sem ocorrência nesta semana: abrir e encerrar pela lista não foi exercitado" });
    return;
  }

  // Abrir e encerrar com motivo.
  await page.getByRole("button", { name: titulo }).first().click();
  const detalhe = page.getByRole("dialog", { name: titulo });
  await expect(detalhe.getByText("Próximas ocorrências")).toBeVisible(DEPOIS_DA_ACAO);
  await detalhe.getByRole("button", { name: "Encerrar tarefa" }).click();
  const encerrar = page.getByRole("dialog", { name: "Encerrar tarefa" });
  await encerrar.getByRole("button", { name: "Encerrar tarefa" }).click();
  await expect(encerrar.getByText("Erro: informe o motivo.")).toBeVisible();
  await encerrar.getByLabel(/^Motivo/).fill("Passou para o robô (sintético)");
  await encerrar.getByRole("button", { name: "Encerrar tarefa" }).click();
  await expect(page.locator(".aviso--sucesso")).toContainText(`Tarefa encerrada: ${titulo}.`, DEPOIS_DA_ACAO);
});
