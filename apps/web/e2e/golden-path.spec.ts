import { expect, test } from "@playwright/test";

/** Same principal the server-side web shell uses for guarded inventory GETs. */
const DEV_AUTH_HEADERS = {
  "x-dev-principal": "web-shell",
  "x-dev-roles": "viewer",
};

test.describe("Golden path — Dashboard → Pendências → Integrações → Jobs", () => {
  test("walks the P2-6 flow and surfaces live vs mock data correctly", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".app-shell")).toBeVisible();

    const nav = page.locator(".sidebar-nav");
    await nav.getByRole("button", { name: "Central de Pendências", exact: true }).click();
    await expect(page).toHaveURL(/\/pendencias$/);

    await nav.getByRole("button", { name: "Integrações", exact: true }).click();
    await expect(page).toHaveURL(/\/integracoes$/);

    const whatsappCard = page.locator(".shell-card--accent");
    await expect(whatsappCard.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
    await expect(whatsappCard.getByText("ADR-0006")).toBeVisible();
    // GET /integrations must never expose a real destination/credential.
    await expect(whatsappCard).not.toContainText(/\+?\d{2}\s?\d{4,5}-?\d{4}/);
    await expect(whatsappCard.getByRole("button", { name: /enviar|send/i })).toHaveCount(0);

    await nav.getByRole("button", { name: "Jobs e Automações", exact: true }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByRole("heading", { name: "Execuções recentes" })).toBeVisible();
    // Live copy intentionally mentions inventoryOnly; assert no mutation controls.
    await expect(page.getByRole("button", { name: /pausar|reprocessar|retry|cutover|migrar/i })).toHaveCount(0);
    await expect(page.getByText(/Sem pausar, reprocessar ou migrar/i)).toBeVisible();
  });

  test("Integrações reflects API mode via the live/mock status pill", async ({ page, request }) => {
    await page.goto("/integracoes");

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
    // Probe the same guarded endpoint the page uses (not unguarded /health).
    const integrations = await request
      .get(`${apiUrl}/integrations`, { headers: DEV_AUTH_HEADERS })
      .catch(() => null);
    const isLive = !!integrations && integrations.ok();

    const pill = page.locator(".panel-card .status-pill").first();
    await expect(pill).toHaveText(isLive ? "Dados reais" : "Mock local");
  });

  test("Pendências, Integrações and Jobs copy never surface requested_by", async ({ page }) => {
    for (const route of ["/pendencias", "/integracoes", "/jobs"]) {
      await page.goto(route);
      const body = await page.locator("main#main-content").innerText();
      expect(body).not.toMatch(/requested_by/i);
    }
  });

  test("header title and active nav item reflect the current route on hard navigation", async ({ page }) => {
    await page.goto("/integracoes");
    await expect(page.locator(".context-page")).toHaveText("Integrações");
    await expect(page.locator(".sidebar-nav").getByRole("button", { name: "Integrações", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
