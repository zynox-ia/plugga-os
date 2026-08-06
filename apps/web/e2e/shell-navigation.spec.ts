import { expect, test } from "@playwright/test";

import { NAV_GROUPS, ROUTE_BY_NAV_ID } from "../app/lib/navigation";

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

test.describe("Plugga shell — smoke", () => {
  test("renders skip-link, brand lockup and all 12 PRD §7 areas", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".skip-link")).toHaveText("Pular para o conteúdo");
    await expect(page.locator(".brand-lockup img")).toBeVisible();

    expect(ALL_ITEMS).toHaveLength(12);
    for (const item of ALL_ITEMS) {
      await expect(page.getByRole("button", { name: item.label })).toBeVisible();
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
      await page.getByRole("button", { name: item.label }).click();
      await page.waitForURL((url) => url.pathname === route);
      expect(new URL(page.url()).pathname).toBe(route);
    });
  }
});
