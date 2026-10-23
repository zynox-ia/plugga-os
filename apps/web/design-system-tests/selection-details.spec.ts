import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.addCookies([{ name: "plugga_session", value: "simulada", url: baseURL! }]);
  await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});

test("seletores exibem ícones sem alterar os nomes e compartilham o raio do campo", async ({ page }) => {
  await page.goto("/design-system?item=selectors");
  const single = page.getByRole("combobox", { name: "Etapa da operação" });
  const multiple = page.getByRole("button", { name: "Serviços: 1 selecionados" });
  await expect(multiple).toHaveCSS("border-radius", await single.evaluate((node) => getComputedStyle(node).borderRadius));
  await expect(single.locator(".ui-option-icon svg")).toHaveCount(1);
  await single.click();
  const proposal = page.getByRole("option", { name: "Proposta enviada", exact: true });
  await expect(proposal.locator(".ui-option-icon svg")).toHaveCount(1);
  await proposal.click();
  await expect(single).toHaveText("Proposta enviada");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await multiple.click();
  const freeMarket = page.getByRole("menuitemcheckbox", { name: "Mercado livre" });
  await expect(freeMarket.locator(".ui-option-icon svg")).toHaveCount(1);
  await freeMarket.click();
  await expect(freeMarket).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".ui-chip").filter({ hasText: "Mercado livre" }).locator(".ui-option-icon svg")).toHaveCount(1);
});

test("checkbox arredondado e switch compacto preservam operação pelo teclado", async ({ page }) => {
  await page.goto("/design-system?item=selection");
  const checkbox = page.getByRole("checkbox", { name: "Selecionar todos", exact: true });
  await expect(checkbox).toHaveCSS("border-radius", "6px");
  await expect(checkbox).toBeChecked({ indeterminate: true });
  await checkbox.focus();
  await checkbox.press("Space");
  await expect(checkbox).toBeChecked();
  const toggle = page.getByRole("switch", { name: "Resumo diário", exact: true });
  const box = await toggle.boundingBox();
  expect(box!.width).toBeLessThan(36);
  expect(box!.height).toBeLessThan(22);
  await toggle.focus();
  await toggle.press("Space");
  await expect(toggle).toBeChecked();
});
