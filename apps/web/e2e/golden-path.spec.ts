import { expect, test } from "@playwright/test";

import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * Jobs é tela técnica, só do desenvolvedor (modelo de 4 papéis), então este
 * caminho entra com a conta de desenvolvimento da equipe de exemplo
 * (SEED_SAMPLE_TEAM, mesma senha do admin) em vez da sessão de admin da suíte.
 */
test.use({
  storageState: { cookies: [], origins: [] },
  extraHTTPHeaders: { "x-forwarded-for": "203.0.113.206" },
});

test.beforeEach(async ({ page }) => {
  await bloquearTerceiros(page);
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("desenvolvimento@plugga.local");
  await page.getByLabel("Senha", { exact: true }).fill(process.env.SEED_ADMIN_PASSWORD ?? "local_only_change_me");
  await page.getByRole("button", { name: "Fazer login" }).click();
  await expect(page).toHaveURL("/");
});

test.describe("Golden path — Início → Integrações → Jobs", () => {
  test("walks the P2-6 flow and surfaces live vs mock data correctly", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-shell")).toBeVisible();

    // A fila de pendências virou o cartão "Decisões de hoje" do Início (o
    // redesenho do painel trocou o título "Central de Pendências"): aparece na
    // mesma tela dos cartões, sem um segundo item de menu para a mesma pergunta.
    await expect(page.getByRole("heading", { name: "Decisões de hoje" })).toBeVisible();

    // Integrações e Jobs saíram da barra lateral e vivem em Configurações.
    await page.goto("/integracoes");
    await expect(page).toHaveURL(/\/configuracoes\?aba=integracoes$/);
    await expect(page.getByRole("heading", { name: "Integrações da empresa" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nenhuma integração conectada" })).toBeVisible();

    await page.goto("/jobs");
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByRole("heading", { name: "Execuções recentes" })).toBeVisible();
    // Live copy intentionally mentions inventoryOnly; assert no mutation controls.
    await expect(page.getByRole("button", { name: /pausar|reprocessar|retry|cutover|migrar/i })).toHaveCount(0);
    await expect(page.getByText(/Sem pausar, reprocessar ou migrar/i)).toBeVisible();
  });

  test("Início, Integrações and Jobs copy never surface requested_by", async ({ page }) => {
    for (const route of ["/", "/configuracoes?aba=integracoes", "/jobs"]) {
      await page.goto(route);
      const body = await page.locator("main#main-content").innerText();
      expect(body).not.toMatch(/requested_by/i);
    }
  });

  test("header title and active nav item reflect the current route on hard navigation", async ({ page }) => {
    await page.goto("/clientes");
    await expect(page.locator(".context-page")).toHaveText("Clientes");
    await expect(page.locator(".sidebar-nav").getByRole("button", { name: "Clientes", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
