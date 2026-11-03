import { expect, test } from "@playwright/test";
import type { CreateClientResponse } from "@plugga/shared";

const prefixo = `Carteira E2E ${Date.now()}`;
const ids: string[] = [];

test.beforeAll(async ({ request, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  for (let i = 0; i < 8; i++) {
    const resposta = await request.post("/api/clientes", { headers: { origin: baseURL! }, data: {
      personType: i < 2 ? "pf" : "pj", name: `${prefixo} ${i + 1}`,
      email: `carteira-${Date.now()}-${i}@teste.local`, city: "Cidade Sintética", state: "SP",
    } });
    expect(resposta.ok(), await resposta.text()).toBe(true);
    ids.push((await resposta.json() as CreateClientResponse).client.id);
  }
});

test.afterAll(async ({ request, baseURL }) => {
  for (const id of ids) {
    const resposta = await request.post(`/api/clientes/${id}/inactivate`, { headers: { origin: baseURL! }, data: {} });
    expect(resposta.ok()).toBe(true);
  }
});

test("cards usam bonequinho e o tipo junto à cidade; filtros acompanham a lista", async ({ page }) => {
  await page.goto(`/clientes?q=${encodeURIComponent(prefixo)}`);
  const cards = page.getByRole("tabpanel", { name: "Cards", exact: true });
  await expect(cards.getByRole("article")).toHaveCount(8);
  const primeiro = cards.getByRole("article").first();
  await expect(primeiro.locator('header [data-avatar-cliente] svg')).toBeVisible();
  await expect(primeiro.locator('[data-avatar-cliente]')).toHaveText(["", ""]);
  const linha = primeiro.locator('[data-tipo-local]');
  await expect(linha).toContainText("Pessoa");
  await expect(linha).toContainText("Cidade Sintética / SP");
  await expect(page.getByText("Dados fictícios para aprovação do layout")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Tipo de pessoa", exact: true }).click();
  await page.getByRole("option", { name: "Pessoa Física", exact: true }).click();
  await expect(cards.getByRole("article")).toHaveCount(2);
  await page.getByRole("tab", { name: "Lista", exact: true }).click();
  await expect(page.getByRole("table", { name: "Clientes cadastrados" }).locator("tbody tr")).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "Paginação da lista de clientes" })).toContainText("2 clientes");
});

test("busca e situação consultam o cadastro e mantêm a lista selecionada", async ({ page }) => {
  await page.goto(`/clientes?q=${encodeURIComponent(prefixo)}`);
  await page.getByRole("tab", { name: "Lista", exact: true }).click();
  await page.getByLabel("Buscar cliente", { exact: true }).fill(`${prefixo} 1`);
  await page.getByRole("button", { name: "Buscar clientes", exact: true }).click();
  await expect(page.getByRole("table", { name: "Clientes cadastrados" }).locator("tbody tr")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Situação", exact: true }).click();
  await page.getByRole("option", { name: "Inativos", exact: true }).click();
  await expect(page.getByText("Nenhum cliente encontrado para a busca.")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Lista", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(page.getByLabel("Buscar cliente", { exact: true })).toHaveValue("");
});

test("lista pagina seis clientes e preserva página e visualização ao abrir a ficha", async ({ page }) => {
  await page.goto(`/clientes?q=${encodeURIComponent(prefixo)}`);
  await page.getByRole("tab", { name: "Lista", exact: true }).click();
  const tabela = page.getByRole("table", { name: "Clientes cadastrados" });
  const paginacao = page.getByRole("navigation", { name: "Paginação da lista de clientes" });
  await expect(tabela.locator("tbody tr")).toHaveCount(6);
  await expect(paginacao).toContainText("1–6");
  await paginacao.getByRole("button", { name: "Próxima página", exact: true }).click();
  await expect(tabela.locator("tbody tr")).toHaveCount(2);
  await expect(paginacao).toContainText("7–8");
  await tabela.getByRole("button", { name: /^Ver ficha de/ }).first().click();
  await expect(page.getByRole("dialog", { name: /^Ficha de/ })).toBeVisible();
  await page.getByRole("button", { name: "Fechar ficha", exact: true }).click();
  await expect(paginacao).toContainText("7–8");
  await expect(page.getByRole("tab", { name: "Lista", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("combobox", { name: "Tipo de pessoa", exact: true }).click();
  await page.getByRole("option", { name: "Pessoa Física", exact: true }).click();
  await expect(paginacao).toContainText("1–2");
});

test("painel e paginação cabem acima do rodapé do Agent", async ({ page }) => {
  await page.goto(`/clientes?q=${encodeURIComponent(prefixo)}`);
  await page.getByRole("tab", { name: "Lista", exact: true }).click();
  for (const tamanho of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(tamanho);
    const paginacao = page.getByRole("navigation", { name: "Paginação da lista de clientes" });
    const rodape = page.getByRole("button", { name: "Agent", exact: true });
    await expect(paginacao).toBeVisible();
    const limites = (await paginacao.boundingBox())!;
    const agent = (await rodape.boundingBox())!;
    expect(limites.y + limites.height).toBeLessThanOrEqual(agent.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
