import { expect as expectPadrao, test, type Page } from "@playwright/test";

import { marcaDaExecucao } from "./support/execucao";
import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * Financeiro (PLU-336/337): a conta a pagar avulsa pela tela de Lançamentos, da
 * criação à aprovação, a correção de valor e o pagamento com comprovante, e o
 * cancelamento com motivo. Dados sintéticos; as
 * categorias e contas correntes vêm do seed local. O que o spec cria leva a
 * marca da execução e sai no teardown (e2e/support/execucao-teardown.ts).
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.236" } });

const expect = expectPadrao.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });

function diaFuturo(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

const ficha = (page: Page) => page.locator("dialog[open]").first();

/** PDF mínimo, com cabeçalho e fim: a API confere o tipo pelo conteúdo. */
const PDF_SINTETICO = Buffer.from(["%PDF-1.4", "% comprovante sintetico", "1 0 obj << >> endobj", "trailer << >>", "%%EOF", ""].join("\n"));

async function escolher(page: Page, dialogo: ReturnType<Page["getByRole"]>, campo: RegExp, opcao?: string) {
  await dialogo.getByRole("combobox", { name: campo }).click();
  const opcoes = page.getByRole("listbox").last().getByRole("option");
  await (opcao ? opcoes.filter({ hasText: opcao }).first() : opcoes.first()).click();
}

async function criarConta(page: Page, baseURL: string, descricao: string) {
  const fornecedor = await page.request.post("/api/suprimentos/fornecedores", { data: { nome: `Fornecedor ${descricao}`, categoria: "servico" }, headers: { origin: new URL(baseURL).origin } });
  expect(fornecedor.status(), await fornecedor.text()).toBe(201);
  const { nome } = (await fornecedor.json()) as { nome: string };

  await page.goto("/financeiro/lancamentos");
  await page.getByRole("button", { name: "Nova conta a pagar" }).first().click();
  const nova = page.getByRole("dialog", { name: "Nova conta a pagar" });

  // A Empresa vem antes: sem ela, Categoria e Conta corrente ficam travadas.
  await expect(nova.getByRole("combobox", { name: /Categoria/ })).toBeDisabled();
  await nova.getByRole("button", { name: "Criar conta" }).click();
  await expect(nova.getByText("Erro: escolha a empresa (Plugga ou Waze Energia).")).toBeVisible();

  await escolher(page, nova, /Empresa/, "Waze Energia");
  await escolher(page, nova, /Fornecedor ou favorecido/, nome);
  await nova.getByLabel("Descrição").fill(descricao);
  await escolher(page, nova, /Categoria/);
  await nova.getByLabel("Valor").fill("1.234,56");
  await nova.getByRole("textbox", { name: /Vencimento/ }).fill(diaFuturo(10));
  await escolher(page, nova, /Forma de pagamento/, "PIX");
  await escolher(page, nova, /Conta corrente/);
  await nova.getByRole("button", { name: "Criar conta" }).click();

  // A conta nasce aberta e a ficha abre nela.
  await expect(ficha(page).getByRole("heading", { name: descricao })).toBeVisible();
  await expect(ficha(page).getByText("R$ 1.234,56").first()).toBeVisible();
  await expect(ficha(page).getByText("Aberta").first()).toBeVisible();
  return nome;
}

test("conta a pagar avulsa nasce aberta e a Gerente aprova pela ficha", async ({ page, baseURL }) => {
  await bloquearTerceiros(page);
  const descricao = `Honorários ${marcaDaExecucao()} ${Date.now().toString(36)} (sintético)`;
  await criarConta(page, baseURL!, descricao);

  await ficha(page).getByRole("button", { name: "Aprovar" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toContainText("Conta aprovada");
  await expect(ficha(page).getByText("Aprovada").first()).toBeVisible();

  // A linha do tempo (da API) registra a aprovação.
  await ficha(page).getByRole("tab", { name: "Linha do tempo" }).click();
  await expect(ficha(page).getByRole("region", { name: "Linha do tempo do lançamento" }).getByText("Aprovada")).toBeVisible();

  // Na lista, ela aparece com o selo "Para pagar".
  await ficha(page).getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("tab", { name: "Lista" }).click();
  const linha = page.getByRole("row").filter({ hasText: descricao });
  await expect(linha.getByText("Para pagar")).toBeVisible();
});

test("aprovada, a conta tem o valor corrigido com motivo e é paga só com o comprovante", async ({ page, baseURL }) => {
  await bloquearTerceiros(page);
  const descricao = `Guia ${marcaDaExecucao()} ${Date.now().toString(36)} (sintético)`;
  await criarConta(page, baseURL!, descricao);
  await ficha(page).getByRole("button", { name: "Aprovar" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toContainText("Conta aprovada");

  // Corrigir o valor pede o motivo, que vai à linha do tempo.
  await ficha(page).getByRole("button", { name: "Corrigir valor" }).click();
  const correcao = page.getByRole("dialog", { name: /Corrigir o valor de CP-/ });
  await correcao.getByLabel("Novo valor").fill("1.300,00");
  await correcao.getByRole("button", { name: "Corrigir valor" }).click();
  await expect(correcao.getByText("diga por que o valor mudou.").first()).toBeVisible();
  await correcao.getByLabel("Motivo").fill("Juros do atraso (sintético)");
  await correcao.getByRole("button", { name: "Corrigir valor" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toContainText("Valor corrigido");
  await expect(ficha(page).getByText("R$ 1.300,00").first()).toBeVisible();

  // Sem o comprovante, o pagamento não sai.
  const pagamento = ficha(page).getByRole("region", { name: "Registrar pagamento" });
  await ficha(page).getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(pagamento.getByText("anexe o comprovante do pagamento.")).toBeVisible();

  // Com ele, o arquivo é anexado e o pagamento registrado.
  await pagamento.locator('input[type="file"]').setInputFiles({ name: "comprovante-sintetico.pdf", mimeType: "application/pdf", buffer: PDF_SINTETICO });
  await ficha(page).getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toContainText("Pagamento registrado");
  await expect(ficha(page).getByRole("region", { name: "Pagamento registrado" })).toBeVisible();

  await ficha(page).getByRole("tab", { name: /Anexos 1/ }).click();
  await expect(ficha(page).getByText("Comprovante ·").first()).toBeVisible();
  await expect(ficha(page).getByRole("button", { name: "Substituir comprovante" })).toBeVisible();

  await ficha(page).getByRole("tab", { name: "Linha do tempo" }).click();
  const tempo = ficha(page).getByRole("region", { name: "Linha do tempo do lançamento" });
  await expect(tempo.getByText("Pagamento registrado")).toBeVisible();
  await expect(tempo.getByText("Valor corrigido de R$ 1.234,56 para R$ 1.300,00")).toBeVisible();
  await expect(tempo.getByText("Juros do atraso (sintético)")).toBeVisible();

  // O comprovante entra no .zip do mês, com o nome padronizado.
  await ficha(page).getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("button", { name: "Baixar comprovantes do período (.zip)" }).first().click();
  const zip = page.getByRole("dialog", { name: "Baixar comprovantes" });
  await escolher(page, zip, /Empresa/, "Waze Energia");
  const [download] = await Promise.all([page.waitForEvent("download"), zip.getByRole("button", { name: "Baixar .zip" }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});

test("cobrança manual: uma por cliente e competência, e a repetida oferece abrir a existente", async ({ page }) => {
  await bloquearTerceiros(page);
  const descricao = `Cobrança ${marcaDaExecucao()} ${Date.now().toString(36)} (sintético)`;
  await page.goto("/financeiro/lancamentos");

  async function preencher() {
    await page.getByRole("button", { name: "Nova cobrança" }).first().click();
    const nova = page.getByRole("dialog", { name: "Nova cobrança" });
    await escolher(page, nova, /Empresa/, "Waze Energia");
    // A competência mais antiga da lista, para não esbarrar numa cobrança do seed.
    await nova.getByRole("combobox", { name: /Competência/ }).click();
    await page.getByRole("listbox").last().getByRole("option").last().click();
    await nova.getByLabel(/^Cliente/).fill("Clínica Exemplo");
    await nova.getByRole("list", { name: "Clientes encontrados" }).getByRole("button").first().click();
    await escolher(page, nova, /Categoria/);
    await nova.getByLabel("Descrição").fill(descricao);
    await nova.getByLabel("Valor").fill("2.640,00");
    await nova.getByRole("textbox", { name: /Vencimento/ }).fill(diaFuturo(15));
    await nova.getByRole("button", { name: "Criar cobrança" }).click();
    return nova;
  }

  await preencher();
  await expect(ficha(page).getByRole("heading", { name: descricao })).toBeVisible();
  await expect(ficha(page).getByText("Gerada").first()).toBeVisible();
  await expect(ficha(page).getByRole("region", { name: "Emitir a nota fiscal" })).toBeVisible();
  await ficha(page).getByRole("button", { name: "Fechar" }).click();

  // A repetida é recusada, com o código da existente para abrir.
  const repetida = await preencher();
  await expect(repetida.getByText(/Já existe a cobrança CR-/)).toBeVisible();
  await repetida.getByRole("button", { name: /Abrir CR-/ }).click();
  await expect(ficha(page).getByRole("heading", { name: descricao })).toBeVisible();
});

test("cancelar pede o motivo, e a ficha mostra onde parou", async ({ page, baseURL }) => {
  await bloquearTerceiros(page);
  const descricao = `Assinatura ${marcaDaExecucao()} ${Date.now().toString(36)} (sintético)`;
  await criarConta(page, baseURL!, descricao);

  await ficha(page).getByRole("button", { name: "Recusar" }).click();
  const motivo = page.getByRole("dialog", { name: /Cancelar CP-/ });
  await motivo.getByRole("button", { name: "Cancelar lançamento" }).click();
  await expect(motivo.getByText("Erro: informe o motivo do cancelamento.").first()).toBeVisible();
  await motivo.getByLabel("Motivo").fill("Fatura duplicada (sintético)");
  await motivo.getByRole("button", { name: "Cancelar lançamento" }).click();

  await expect(ficha(page).getByRole("region", { name: "Lançamento cancelado" })).toContainText("Fatura duplicada (sintético)");
  await expect(ficha(page).getByRole("button", { name: "Aprovar" })).toHaveCount(0);
});
