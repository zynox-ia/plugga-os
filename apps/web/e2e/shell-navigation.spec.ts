import { expect, test } from "@playwright/test";

import { NAV_GROUPS, ROUTE_BY_NAV_ID } from "../app/lib/navigation";

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

test.describe("Plugga shell — smoke", () => {
  test("renders skip-link, brand lockup and all PRD §7 areas + Central de Pendências", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".skip-link")).toHaveText("Pular para o conteúdo");
    await expect(page.locator(".brand-lockup img")).toBeVisible();

    // 12 PRD §7 areas + Central de Pendências (Tela 2) + Clientes (Tela 4, added for the Comercial/Clientes flow).
    expect(ALL_ITEMS).toHaveLength(14);
    for (const item of ALL_ITEMS) {
      await expect(page.locator(".sidebar-nav").getByRole("button", { name: item.label, exact: true })).toBeVisible();
    }
  });

  test("mobile: sidebar is off-canvas and toggled via aria-expanded menu button", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const toggle = page.locator(".menu-toggle");
    const sidebar = page.locator(".sidebar");

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(sidebar).not.toHaveClass(/sidebar--open/);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar).toHaveClass(/sidebar--open/);
  });

  for (const item of ALL_ITEMS) {
    const route = ROUTE_BY_NAV_ID[item.id];
    test(`nav: "${item.label}" routes to ${route}`, async ({ page }) => {
      await page.goto("/");
      await page.locator(".sidebar-nav").getByRole("button", { name: item.label, exact: true }).click();
      await page.waitForURL((url) => url.pathname === route);
      expect(new URL(page.url()).pathname).toBe(route);
    });
  }
});
