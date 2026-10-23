import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.addCookies([{ name: "plugga_session", value: "simulada", url: baseURL! }]);
  await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
});

test("campos não ganham contorno ou sombra de foco", async ({ page }) => {
  await page.goto("/design-system");
  const input = page.getByRole("textbox", { name: "Nome da operação" });
  const wrapper = input.locator("..");
  const border = await wrapper.evaluate((node) => getComputedStyle(node).borderColor);
  await input.fill("Operação de exemplo");
  await expect(input).toHaveCSS("outline-style", "none");
  await expect(wrapper).toHaveCSS("outline-style", "none");
  await expect(wrapper).toHaveCSS("box-shadow", "none");
  await expect(wrapper).toHaveCSS("border-color", border);
  await expect(page.locator('label[for="' + await input.getAttribute("id") + '"]')).toHaveCSS("text-decoration-line", "none");
  await expect(wrapper).toHaveCSS("background-color", "rgb(243, 244, 246)");
  await page.keyboard.press("Tab");
  const category = page.getByRole("combobox", { name: "Categoria", exact: true });
  await expect(category).toBeFocused();
  await expect(category).toHaveCSS("outline-style", "none");
  await expect(category).toHaveCSS("box-shadow", "none");
  const date = page.getByRole("textbox", { name: "Data de início", exact: true });
  await date.focus();
  await expect(date).toHaveCSS("outline-style", "none");
  await expect(date.locator("..")).toHaveCSS("outline-style", "none");
  await expect(date.locator("..")).toHaveCSS("box-shadow", "none");
});

test("categoria usa lista própria, confirma e cancela seleções pelo teclado", async ({ page }) => {
  await page.goto("/design-system");
  const category = page.getByRole("combobox", { name: "Categoria", exact: true });
  const categoryId = await category.getAttribute("id");
  await category.click();
  await expect(page.getByRole("listbox", { name: "Categoria" })).toBeVisible();
  await expect(page.locator(`label[for="${categoryId}"]`)).toHaveCSS("text-decoration-line", "none");
  await expect(page.locator(`button[id="${categoryId}"]`)).toHaveCSS("background-color", "rgb(243, 244, 246)");
  await page.getByRole("option", { name: "Mercado livre", exact: true }).click();
  await expect(category).toHaveText("Mercado livre");
  await expect(category).toHaveAttribute("aria-expanded", "false");
  await category.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Mercado livre", exact: true })).toBeFocused();
  const selected = page.getByRole("option", { name: "Mercado livre", exact: true });
  await expect(selected).toHaveCSS("text-decoration-line", "none");
  const check = selected.locator(".ui-select-indicator svg");
  await expect(check).toBeVisible();
  await expect(check).toHaveCSS("color", "rgb(18, 103, 68)");
  const row = (await selected.boundingBox())!;
  const mark = (await check.boundingBox())!;
  expect(row.x + row.width - mark.x - mark.width).toBeLessThanOrEqual(12);
  await page.keyboard.press("End");
  await expect(page.getByRole("option", { name: "Geração distribuída", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(category).toHaveText("Mercado livre");
  await category.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Mercado livre", exact: true })).toBeFocused();
  await page.keyboard.type("gera");
  await expect(page.getByRole("option", { name: "Geração distribuída", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(category).toHaveText("Geração distribuída");
  await expect(category).toBeFocused();
  await category.click();
  // O Radix bloqueia os controles de fundo; o clique deve atingir a superfície externa.
  const heading = await page.locator("h1").boundingBox();
  await page.mouse.click(heading!.x + 8, heading!.y + 8);
  await expect(category).toHaveAttribute("aria-expanded", "false");
  expect(await category.evaluate((node) => node.tagName)).toBe("BUTTON");
});

test("seletor ignora opção indisponível e controla o exemplo de botão", async ({ page }) => {
  await page.goto("/design-system?item=selectors");
  const stage = page.getByRole("combobox", { name: "Etapa da operação" });
  await stage.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Em análise", exact: true })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("option", { name: "Em contratação", exact: true })).toBeFocused();
  await expect(page.getByRole("option", { name: "Arquivada (indisponível)" })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Enter");
  await expect(stage).toHaveText("Em contratação");
  await expect(page.getByRole("combobox", { name: "Seletor desabilitado" })).toBeDisabled();
  await page.goto("/design-system?item=buttons");
  await page.getByRole("combobox", { name: "Variante" }).click();
  await page.getByRole("option", { name: "Destrutivo" }).click();
  await expect(page.getByRole("button", { name: "Salvar alterações" })).toHaveClass(/button--perigo/);
});

test("calendário próprio navega entre meses, seleciona e devolve o foco", async ({ page }) => {
  await page.goto("/design-system");
  const input = page.getByRole("textbox", { name: "Data de início", exact: true });
  await expect(input).toHaveValue("22/10/2026");
  const trigger = page.getByRole("button", { name: "Abrir calendário de Data de início" });
  await trigger.click();
  const calendar = page.getByRole("dialog", { name: "Calendário de Data de início" });
  await expect(calendar).toBeVisible();
  await expect(calendar.getByRole("button", { name: "22 de outubro de 2026", exact: true })).toBeFocused();
  await expect(calendar.getByRole("button", { name: "22 de outubro de 2026", exact: true })).toHaveCSS("text-decoration-line", "none");
  await calendar.getByRole("button", { name: "Próximo mês", exact: true }).click();
  await calendar.getByRole("button", { name: "15 de novembro de 2026", exact: true }).click();
  await expect(input).toHaveValue("15/11/2026");
  await expect(calendar).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(input).toHaveValue("15/11/2026");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(input).toHaveValue("16/11/2026");
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
});

test("calendário compacto acompanha o botão e inverte a abertura perto da borda", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/design-system?item=dates");
  const trigger = page.getByRole("button", { name: "Abrir calendário de Data da operação" });
  const calendar = page.getByRole("dialog", { name: "Calendário de Data da operação" });
  await trigger.click();
  await expect(calendar).toHaveAttribute("data-side", "bottom");
  const button = (await trigger.boundingBox())!;
  const panel = (await calendar.boundingBox())!;
  expect(Math.abs(panel.x + panel.width - button.x - button.width)).toBeLessThanOrEqual(1);
  expect(panel.y - button.y - button.height).toBeGreaterThanOrEqual(4);
  expect(panel.y - button.y - button.height).toBeLessThanOrEqual(10);
  expect(panel.width).toBeLessThanOrEqual(264);
  expect(panel.height).toBeLessThanOrEqual(320);
  await expect(calendar.getByText(/Use as setas/)).toHaveCount(0);
  const caption = (await calendar.locator(".rdp-month_caption").boundingBox())!;
  const previous = (await calendar.getByRole("button", { name: "Mês anterior", exact: true }).boundingBox())!;
  const next = (await calendar.getByRole("button", { name: "Próximo mês", exact: true }).boundingBox())!;
  expect(previous.x).toBeGreaterThan(caption.x + caption.width / 2);
  expect(Math.abs(previous.y - next.y)).toBeLessThanOrEqual(1);
  expect(next.x - previous.x - previous.width).toBeLessThanOrEqual(8);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 500 });
  await trigger.click();
  await expect(calendar).toHaveAttribute("data-side", "top");
  const upperPanel = (await calendar.boundingBox())!;
  const lowerButton = (await trigger.boundingBox())!;
  expect(upperPanel.y).toBeGreaterThanOrEqual(0);
  expect(lowerButton.y - upperPanel.y - upperPanel.height).toBeGreaterThanOrEqual(4);
  expect(lowerButton.y - upperPanel.y - upperPanel.height).toBeLessThanOrEqual(10);
});

test("data digitada valida dias reais e limites, permite limpar e usar hoje", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-22T12:00:00"));
  await page.goto("/design-system?item=dates");
  const input = page.getByRole("textbox", { name: /^Data da operação/ });
  await input.fill("31/02/2026");
  await input.press("Tab");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveAccessibleDescription(/Informe uma data válida/);
  await page.getByRole("button", { name: "Confirmar data" }).click();
  await expect(page.getByText("Data confirmada no exemplo.")).toHaveCount(0);
  await input.fill("29022028");
  await input.press("Tab");
  await expect(input).toHaveValue("29/02/2028");
  await expect(input).not.toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Confirmar data" }).click();
  await expect(page.getByText("Data confirmada no exemplo.")).toBeVisible();
  expect(await input.evaluate((node: HTMLInputElement) => new FormData(node.form!).get("data"))).toBe("2028-02-29");
  await page.getByRole("button", { name: "Abrir calendário de Data da operação" }).click();
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(input).toHaveValue("22/10/2026");
  await page.getByRole("button", { name: "Abrir calendário de Data da operação" }).click();
  await page.getByRole("button", { name: "Limpar", exact: true }).click();
  await expect(input).toHaveValue("");
  const limited = page.getByRole("textbox", { name: "Dentro do período", exact: true });
  await limited.fill("01/01/2027");
  await limited.press("Tab");
  await expect(limited).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Abrir calendário de Dentro do período" }).click();
  await expect(page.getByRole("button", { name: "Próximo mês", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "1 de janeiro de 2027", exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "31 de dezembro de 2026", exact: true }).click();
  await expect(limited).toHaveValue("31/12/2026");
});

for (const width of [320, 768, 1440]) {
  test(`menus e calendário cabem na tela de ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/design-system");
    await page.getByRole("combobox", { name: "Categoria", exact: true }).click();
    const list = page.getByRole("listbox", { name: "Categoria" });
    await expect(list).toBeVisible();
    for (const popup of [list, page.getByRole("dialog", { name: "Calendário de Data de início" })]) {
      if (popup !== list) await page.getByRole("button", { name: "Abrir calendário de Data de início" }).click();
      await expect(popup).toBeVisible();
      const box = await popup.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(740);
      expect(await popup.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      await page.keyboard.press("Escape");
    }
  });
}
