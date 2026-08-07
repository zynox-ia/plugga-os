import { expect, test } from "@playwright/test";

test.describe("Energia & OPM — navegação e telas", () => {
  test("Migrações Mercado Livre carrega via nav e mostra a fila", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-nav").getByRole("button", { name: "Migrações ML", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/energia-opm/migracoes");
    await expect(page.getByRole("heading", { name: "Migrações Mercado Livre" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Nova migração" })).toBeVisible();
  });

  test("Ciclos Mensais carrega via nav e mostra o kanban", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-nav").getByRole("button", { name: "Ciclos Mensais", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/energia-opm/ciclos");
    await expect(page.getByRole("heading", { name: "Ciclos Mensais" })).toBeVisible();
  });

  test("Auditorias carrega via nav e mostra a lista", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-nav").getByRole("button", { name: "Auditorias", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/energia-opm/auditorias");
    await expect(page.getByRole("heading", { name: "Auditorias" })).toBeVisible();
  });

  test("Relatórios OPM carrega via nav e mostra o histórico agregado", async ({ page }) => {
    await page.goto("/");
    await page.locator(".sidebar-nav").getByRole("button", { name: "Relatórios OPM", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/energia-opm/relatorios");
    await expect(page.getByRole("heading", { name: "Relatórios" })).toBeVisible();
  });
});
