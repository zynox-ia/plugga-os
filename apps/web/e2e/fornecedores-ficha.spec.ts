import { expect as expectPadrao, test } from "@playwright/test";

import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * Ficha rica do fornecedor (PLU-334): leitura com desempenho, endereço no
 * mapa, histórico de cotações e pagamento mascarado. Dados sintéticos.
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.231" } });
const expect = expectPadrao.configure({ timeout: 15_000 });

test("ficha do fornecedor mostra desempenho, endereço e pagamento mascarado", async ({ page, baseURL }) => {
  await bloquearTerceiros(page);
  const origin = new URL(baseURL!).origin;
  const sufixo = Date.now().toString(36);
  const criado = await page.request.post("/api/suprimentos/fornecedores", {
    headers: { origin },
    data: {
      nome: `Ficha E2E ${sufixo} (sintético)`, categoria: "material_eletrico", telefone: "92999990001", email: "ficha@exemplo.invalid",
      cep: "69005000", logradouro: "Av. Exemplo", numero: "100", bairro: "Centro", cidade: "Manaus", uf: "AM",
      formasDePagamento: ["pix"], chavePix: "99999001000159",
    },
  });
  expect(criado.status(), await criado.text()).toBe(201);
  const { id } = (await criado.json()) as { id: string };

  await page.goto(`/suprimentos/fornecedores?fornecedor=${id}`);
  const ficha = page.locator("dialog[open]").first();
  await expect(ficha.getByRole("heading", { name: `Ficha E2E ${sufixo} (sintético)` })).toBeVisible();

  // Visão geral: os 4 cards, contato com Ligar/WhatsApp e o endereço no mapa.
  const metricas = ficha.getByRole("group", { name: "Desempenho do fornecedor" });
  for (const rotulo of ["Cotações", "Vitórias", "Comprado", "Prazo médio"]) await expect(metricas.getByText(rotulo, { exact: true })).toBeVisible();
  await expect(metricas.getByText("nenhuma ainda")).toBeVisible();
  await expect(ficha.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/5592999990001");
  await expect(ficha.getByText("69005-000")).toBeVisible();
  await expect(ficha.getByText("Av. Exemplo, 100")).toBeVisible();
  await expect(ficha.locator('iframe[title="Google Maps — localização do fornecedor"]')).toBeAttached();

  // Cotações: sem nenhuma ainda.
  await ficha.getByRole("tab", { name: /Cotações/ }).click();
  await expect(ficha.getByText("Nenhuma cotação com este fornecedor ainda.")).toBeVisible();

  // Pagamento: escondido por padrão, Mostrar revela e Ocultar volta.
  await ficha.getByRole("tab", { name: "Pagamento" }).click();
  await expect(ficha.getByText("•••• 0159")).toBeVisible();
  await expect(ficha.getByText("99999001000159")).toHaveCount(0);
  await ficha.getByRole("button", { name: "Mostrar Chave PIX" }).click();
  await expect(ficha.getByText("99999001000159")).toBeVisible();
  await ficha.getByRole("button", { name: "Ocultar Chave PIX" }).click();
  await expect(ficha.getByText("•••• 0159")).toBeVisible();

  // Editar abre o formulário com o endereço.
  await ficha.getByRole("button", { name: "Editar fornecedor" }).click();
  const form = page.getByRole("dialog", { name: `Fornecedor Ficha E2E ${sufixo} (sintético)` });
  await expect(form.getByLabel("CEP")).toHaveValue("69005-000");
  await expect(form.getByLabel("Logradouro")).toHaveValue("Av. Exemplo");
});
