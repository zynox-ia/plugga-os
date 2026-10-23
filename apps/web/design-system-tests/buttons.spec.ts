import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.addCookies([{ name: "plugga_session", value: "simulada", url: baseURL! }]);
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
  });
  await page.goto("/design-system?item=buttons");
});

test("três variantes compartilham ícones à esquerda e a mesma ação secundária", async ({ page }) => {
  for (const name of ["Nova operação", "Exportar", "Ver detalhes", "Excluir exemplo", "Salvar alterações"]) {
    const button = page.getByRole("button", { name, exact: true });
    const icon = button.locator(".ui-button-icon");
    await expect(icon.locator("svg")).toHaveCount(1);
    await expect(icon).toHaveAttribute("aria-hidden", "true");
    const iconBox = await icon.boundingBox();
    const labelBox = await button.locator(".ui-button-label").boundingBox();
    expect(iconBox).not.toBeNull();
    expect(labelBox).not.toBeNull();
    expect(iconBox!.x + iconBox!.width).toBeLessThan(labelBox!.x);
  }
  await expect(page.getByRole("button", { name: "Exportar", exact: true })).toHaveClass(/button--secondary/);
  await expect(page.getByRole("button", { name: "Ver detalhes", exact: true })).toHaveClass(/button--secondary/);
  await page.getByRole("combobox", { name: "Variante" }).click();
  await expect(page.getByRole("option")).toHaveText(["Primário", "Secundário", "Destrutivo"]);
});

test("hover muda a superfície sem sombra ou deslocamento", async ({ page }) => {
  for (const name of ["Nova operação", "Exportar", "Ver detalhes", "Excluir exemplo"]) {
    const button = page.getByRole("button", { name, exact: true });
    const surface = () => button.evaluate((element) => {
      const style = getComputedStyle(element);
      return `${style.backgroundColor}|${style.borderColor}|${style.filter}`;
    });
    const before = await surface();
    const initialBox = await button.boundingBox();
    await button.hover();
    await expect(button).toHaveCSS("box-shadow", "none");
    await expect(button).toHaveCSS("transform", "none");
    await expect.poll(surface).not.toBe(before);
    const hoveredBox = await button.boundingBox();
    expect(hoveredBox!.y).toBeCloseTo(initialBox!.y, 1);
    expect(hoveredBox!.height).toBeCloseTo(initialBox!.height, 1);
  }
});

test("carregamento substitui o ícone e bloqueia a ação sem duplicar indicadores", async ({ page }) => {
  const button = page.getByRole("button", { name: "Salvar alterações", exact: true });
  const initialIconBox = await button.locator(".ui-button-icon").boundingBox();
  await page.getByRole("checkbox", { name: "Carregando" }).check();
  const loading = page.getByRole("button", { name: "Salvando…", exact: true });
  await expect(loading).toBeDisabled();
  await expect(loading).toHaveAttribute("aria-busy", "true");
  await expect(loading.locator(".ui-spinner")).toHaveCount(1);
  await expect(loading.locator(".ui-button-icon svg")).toHaveCount(0);
  const loadingIconBox = await loading.locator(".ui-button-icon").boundingBox();
  expect(loadingIconBox!.width).toBe(initialIconBox!.width);
  await loading.click({ force: true });
  await expect(page.getByRole("status")).toHaveText("Clique em um botão para experimentar.");
  await page.getByRole("checkbox", { name: "Carregando" }).uncheck();
  await page.getByRole("checkbox", { name: "Desabilitado" }).check();
  await expect(button).toBeDisabled();
  await button.hover({ force: true });
  await expect(button).toHaveCSS("box-shadow", "none");
  await expect(button).toHaveCSS("transform", "none");
  const secondary = page.getByRole("button", { name: "Exportar", exact: true });
  await secondary.focus();
  await secondary.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Ação secundária acionada.");
});
