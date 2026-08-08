import { expect, test } from "@playwright/test";

test.describe("Golden path — Início → Integrações → Jobs", () => {
  test("walks the P2-6 flow and surfaces live vs mock data correctly", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-shell")).toBeVisible();

    // A Central de Pendências virou seção do Início: a fila aparece na mesma
    // tela dos cartões, sem um segundo item de menu para a mesma pergunta.
    await expect(page.getByRole("heading", { name: "Central de Pendências" })).toBeVisible();

    // Integrações e Jobs saíram da barra lateral e vivem em Configurações.
    await page.goto("/integracoes");
    await expect(page).toHaveURL(/\/integracoes$/);

    // .shell-card--accent also matches the Bitrix migrator card (ADR-0009),
    // so scope to the one containing the WhatsApp heading.
    const whatsappCard = page
      .locator(".shell-card--accent")
      .filter({ has: page.getByRole("heading", { name: "WhatsApp" }) });
    await expect(whatsappCard.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
    await expect(whatsappCard.getByText("ADR-0006")).toBeVisible();
    // GET /integrations must never expose a real destination/credential.
    await expect(whatsappCard).not.toContainText(/\+?\d{2}\s?\d{4,5}-?\d{4}/);
    await expect(whatsappCard.getByRole("button", { name: /enviar|send/i })).toHaveCount(0);

    await page.goto("/jobs");
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByRole("heading", { name: "Execuções recentes" })).toBeVisible();
    // Live copy intentionally mentions inventoryOnly; assert no mutation controls.
    await expect(page.getByRole("button", { name: /pausar|reprocessar|retry|cutover|migrar/i })).toHaveCount(0);
    await expect(page.getByText(/Sem pausar, reprocessar ou migrar/i)).toBeVisible();
  });

  test("Integrações reflects API mode via the live/mock status pill", async ({ page, request }) => {
    await page.goto("/integracoes");

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
    // The page now authenticates GET /integrations with the visitor's real
    // session cookie (forwarded server-side), not a fixed dev-auth header
    // that this test's separate APIRequestContext has no way to attach
    // cross-origin. Since a logged-in visitor's session always authenticates
    // successfully, API reachability alone (via the unguarded /health) is the
    // right proxy for "did the page get real data."
    const health = await request.get(`${apiUrl}/health`).catch(() => null);
    const isLive = !!health && health.ok();

    const pill = page.locator(".panel-card .status-pill").first();
    await expect(pill).toHaveText(isLive ? "Dados reais" : "Mock local");
  });

  test("Início, Integrações and Jobs copy never surface requested_by", async ({ page }) => {
    for (const route of ["/", "/integracoes", "/jobs"]) {
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
