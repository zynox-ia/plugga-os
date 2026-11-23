import { expect, test, type Page } from "@playwright/test";

import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * Compras (PLU-328): o caminho feliz pela tela, da criação à conclusão, com
 * dados sintéticos. Cada ação é a que a API permite na etapa (acoesPermitidas).
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.228" } });

const PDF = { name: "cotacao-e2e.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") };

function diaFuturo(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

const ficha = (page: Page) => page.locator("dialog[open]").first();

test("pedido de compra vai de Pedido gerado a Concluído pela ficha", async ({ page, baseURL }) => {
  await bloquearTerceiros(page);
  const sufixo = Date.now().toString(36);
  const fornecedor = await page.request.post("/api/suprimentos/fornecedores", { data: { nome: `Fornecedor E2E ${sufixo} (sintético)`, categoria: "material_eletrico" }, headers: { origin: new URL(baseURL!).origin } });
  expect(fornecedor.status(), await fornecedor.text()).toBe(201);
  const { nome: nomeDoFornecedor } = (await fornecedor.json()) as { nome: string };

  await page.goto("/suprimentos/compras");
  await page.getByRole("button", { name: "Novo pedido" }).first().click();
  const novo = page.getByRole("dialog", { name: "Novo pedido de compra" });
  await novo.getByRole("radio", { name: "Waze Energia" }).click();
  await novo.getByLabel("Título").fill(`Cabos E2E ${sufixo} (sintético)`);
  await novo.getByRole("radio", { name: "Interno" }).click();
  await novo.getByLabel("Descrição do item 1").fill("Cabo de teste 6 mm");
  await novo.getByLabel("Quantidade do item 1").fill("1.234,5");
  await novo.getByRole("textbox", { name: /Entrega desejada/ }).fill(diaFuturo(20));
  await novo.getByLabel("Valor orçado").fill("2.000,00");
  await novo.getByRole("button", { name: "Criar pedido" }).click();

  await expect(ficha(page).getByRole("heading", { name: `Cabos E2E ${sufixo} (sintético)` })).toBeVisible();
  await expect(ficha(page).getByText("O que falta para avançar")).toBeVisible();

  await ficha(page).getByRole("button", { name: "Iniciar análise de estoque" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Pedido em análise de estoque.");
  await ficha(page).getByRole("button", { name: /Não, precisa comprar/ }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toContainText("Cotações");

  await ficha(page).getByRole("button", { name: "Adicionar cotação" }).click();
  const cotacao = page.getByRole("dialog", { name: "Adicionar cotação" });
  await cotacao.getByRole("combobox").first().click();
  await page.getByRole("option", { name: nomeDoFornecedor }).click();
  await cotacao.getByLabel("Valor").fill("1.890,50");
  await cotacao.getByLabel("Prazo de entrega (dias úteis)").fill("4");
  await cotacao.locator("input[type=file]").setInputFiles(PDF);
  await cotacao.getByRole("button", { name: "Registrar cotação" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Cotação registrada.");

  await ficha(page).getByRole("tab", { name: /Cotações/ }).click();
  await ficha(page).getByRole("button", { name: "Escolher como vencedora" }).click();
  await expect(ficha(page).getByText("Vencedora", { exact: true })).toBeVisible();
  await ficha(page).getByRole("tab", { name: "Visão geral" }).click();
  await expect(ficha(page).getByText("R$ 109,50 abaixo")).toBeVisible();

  await ficha(page).getByRole("button", { name: "Enviar para aprovação" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Pedido enviado para aprovação.");
  await ficha(page).getByRole("button", { name: "Aprovar compra" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Compra aprovada.");

  await ficha(page).getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(ficha(page).getByText("Erro: escolha a forma de pagamento.")).toBeVisible();
  await ficha(page).getByRole("radio", { name: "PIX" }).click();
  await ficha(page).getByRole("button", { name: "Registrar pagamento" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Pagamento registrado.");

  await expect(ficha(page).getByLabel("Valor faturado")).toHaveValue("1.890,50");
  await ficha(page).getByRole("button", { name: "Confirmar recebimento" }).click();
  await expect(ficha(page).locator(".aviso--sucesso")).toHaveText("Recebimento confirmado: aquisição concluída.");
  await expect(ficha(page).getByRole("region", { name: "Aquisição concluída" })).toContainText("R$ 1.890,50 faturado");

  await ficha(page).getByRole("tab", { name: "Linha do tempo" }).click();
  await expect(ficha(page).getByText("confirmou o recebimento", { exact: false })).toBeVisible();
});
