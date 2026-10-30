import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.addCookies([{ name: "plugga_session", value: "simulada", url: baseURL! }]);
  await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.goto("/design-system?item=modals");
});

test("modal reduz a largura em vinte por cento nas três opções", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [size, width] of [["Estreita", 448], ["Média", 608], ["Larga", 864]] as const) {
    await page.getByRole("combobox", { name: "Largura do diálogo" }).click();
    await page.getByRole("option", { name: size, exact: true }).click();
    await page.getByRole("button", { name: "Abrir formulário", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Editar projeto", exact: true });
    expect((await dialog.boundingBox())!.width).toBeCloseTo(width, 0);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    if (size === "Média") await page.screenshot({ path: testInfo.outputPath("modal-compacto.png") });
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  }
});

test("valor monetário permite editar, colar, limpar e salvar sem controles numéricos", async ({ page }) => {
  const open = page.getByRole("button", { name: "Abrir formulário", exact: true });
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Editar projeto", exact: true });
  const amount = dialog.getByRole("textbox", { name: "Valor estimado", exact: true });
  await expect(amount).toHaveAttribute("inputmode", "decimal");
  await expect(amount).toHaveValue("25.000,00");
  await expect(dialog.getByRole("spinbutton")).toHaveCount(0);
  await amount.fill("1234,56");
  await amount.press("Tab");
  await expect(amount).toHaveValue("1.234,56");
  await amount.fill("R$ 9.876,50");
  await amount.press("Tab");
  await expect(amount).toHaveValue("9.876,50");
  await amount.clear();
  await amount.press("Tab");
  await expect(amount).toHaveValue("");
  await amount.fill("0");
  await amount.press("Tab");
  await expect(amount).toHaveValue("0,00");
  await amount.fill("-10");
  await amount.press("Tab");
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await dialog.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(dialog).toBeVisible();
  await amount.fill("7654,32");
  await amount.press("Enter");
  await expect(dialog).toHaveCount(0);
  await open.click();
  await expect(amount).toHaveValue("7.654,32");
});
