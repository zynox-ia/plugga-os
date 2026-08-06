import { expect, test } from "@playwright/test";

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

    await nav.getByRole("button", { name: "Jobs e Automações", exact: true }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(page.getByRole("heading", { name: "Execuções recentes" })).toBeVisible();
  });

  test("Integrações reflects API mode via the live/mock status pill", async ({ page, request }) => {
    await page.goto("/integracoes");

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
    const health = await request.get(`${apiUrl}/health`).catch(() => null);
    const isLive = !!health && health.ok();

    const pill = page.locator(".panel-card .status-pill").first();
    await expect(pill).toHaveText(isLive ? "Dados reais" : "Mock local");
  });

  test("no financeiro/OPM domain data leaks into Pendências, Integrações or Jobs copy", async ({ page }) => {
    for (const route of ["/pendencias", "/integracoes", "/jobs"]) {
      await page.goto(route);
      const body = await page.locator("main#main-content").innerText();
      expect(body).not.toMatch(/requested_by/i);
    }
  });

  test("header title and active nav item reflect the current route on hard navigation", async ({ page }) => {
    await page.goto("/integracoes");
    await expect(page.locator(".context-page")).toHaveText("Integrações");
    await expect(page.getByRole("button", { name: "Integrações" })).toHaveAttribute("aria-current", "page");
  });
});
