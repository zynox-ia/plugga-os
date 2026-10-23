import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.addCookies([{ name: "plugga_session", value: "simulada", url: baseURL! }]);
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" ? route.continue() : route.abort();
  });
});

test("busca por componente, informa resultado vazio e preserva a navegação ao recarregar", async ({ page }) => {
  await page.goto("/design-system");
  await expect(page.getByRole("heading", { name: "Uma linguagem para todo o sistema." })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Buscar componentes" });
  await search.fill("  botoes  ");
  await page.getByRole("link", { name: "Botões", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Botões", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Botões", exact: true })).toBeVisible();
  await search.fill("inexistente123");
  await expect(page.getByText("Nenhum componente encontrado.")).toBeVisible();
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await expect(page.getByRole("link", { name: "Campos de entrada", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Campos de entrada", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Campos de entrada", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Botões", exact: true })).toBeVisible();
});

test("combobox filtra, seleciona pelo teclado e mantém a escolha ao cancelar", async ({ page }) => {
  await page.goto("/design-system?item=selectors");
  const combo = page.getByRole("combobox", { name: "Distribuidora" });
  await combo.fill("sul");
  await combo.press("ArrowDown");
  await combo.press("Enter");
  await expect(combo).toHaveValue("Distribuidora Sul");
  await expect(combo).toHaveAttribute("aria-expanded", "false");
  await combo.fill("inexistente123");
  await expect(page.getByText("Nenhuma opção encontrada.")).toBeVisible();
  await combo.press("Escape");
  await expect(combo).toHaveValue("Distribuidora Sul");
  await expect(combo).toBeFocused();
  await combo.click();
  const selected = page.getByRole("option", { name: "Distribuidora Sul", exact: false });
  await expect(selected.locator(".ui-option-check")).toHaveCSS("color", "rgb(18, 103, 68)");
  await page.getByRole("heading", { name: "Seletores", exact: true }).click();
  await expect(combo).toHaveAttribute("aria-expanded", "false");
});

test("menu com check mantém seleção e devolve o foco ao fechar", async ({ page }) => {
  await page.goto("/design-system?item=menus");
  const trigger = page.getByRole("button", { name: "Colunas visíveis" });
  await trigger.focus();
  await trigger.press("ArrowDown");
  const item = page.getByRole("menuitemcheckbox", { name: "Valor" });
  await expect(item).toHaveAttribute("aria-checked", "true");
  await expect(item.locator("svg")).toHaveCSS("color", "rgb(18, 103, 68)");
  await item.click();
  await expect(item).toHaveAttribute("aria-checked", "false");
  await item.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("seleção múltipla adiciona e remove chips", async ({ page }) => {
  await page.goto("/design-system?item=selectors");
  await page.getByRole("button", { name: "Serviços: 1 selecionados" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Mercado livre" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Serviços: 2 selecionados" })).toBeVisible();
  await page.getByRole("button", { name: "Remover Mercado livre" }).click();
  await expect(page.getByRole("button", { name: "Serviços: 1 selecionados" })).toBeVisible();
});

test("campo valida e associa a mensagem de erro à entrada", async ({ page }) => {
  await page.goto("/design-system?item=inputs");
  const name = page.getByRole("textbox", { name: "Nome do projeto" });
  await name.clear();
  await page.getByRole("button", { name: "Validar exemplo" }).click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription("Erro: Informe o nome do projeto.");
  await name.fill("Projeto de teste");
  await page.getByRole("button", { name: "Validar exemplo" }).click();
  await expect(page.getByText("Campos validados.")).toBeVisible();
});

test("modal mantém o foco, fecha com Escape e só salva ao confirmar", async ({ page }) => {
  await page.goto("/design-system?item=modals");
  const trigger = page.getByRole("button", { name: "Abrir formulário" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Editar projeto" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Nome do projeto" }).fill("Projeto alterado");
  for (let step = 0; step < 7; step++) {
    await page.keyboard.press("Tab");
    await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  for (let step = 0; step < 7; step++) {
    await page.keyboard.press("Shift+Tab");
    await expect.poll(() => dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog.getByRole("textbox", { name: "Nome do projeto" })).toHaveValue("Projeto de demonstração");
  await dialog.getByRole("textbox", { name: "Nome do projeto" }).fill("Projeto alterado");
  await dialog.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Projeto alterado", { exact: true })).toBeVisible();
});

test("abas funcionam com setas e tabela preserva seleção fora do filtro", async ({ page }) => {
  await page.goto("/design-system?item=navigation");
  const tab = page.getByRole("tab", { name: "Resumo" });
  await tab.focus(); await tab.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Atividades" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Atividades" })).toBeVisible();
  await page.goto("/design-system?item=tables");
  await page.getByRole("checkbox", { name: "Selecionar Projeto Aurora" }).check();
  const search = page.getByRole("searchbox", { name: "Buscar operações" });
  await search.fill("horizonte");
  await page.getByRole("checkbox", { name: "Selecionar linhas visíveis" }).check();
  await expect(page.getByText("2 selecionadas")).toBeVisible();
  await search.clear();
  await expect(page.getByRole("checkbox", { name: "Selecionar Projeto Aurora" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Selecionar Projeto Horizonte" })).toBeChecked();
  await search.fill("inexistente123");
  await expect(page.getByRole("heading", { name: "Nenhuma operação encontrada" })).toBeVisible();
});

test("cópia recusada não informa sucesso", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("Permissão negada")) } });
  });
  await page.goto("/design-system?item=colors");
  const copy = page.getByRole("button", { name: "Copiar Marinho 950", exact: true });
  await copy.click();
  await expect(copy.getByRole("status")).toHaveText("Não foi possível copiar. Selecione o valor manualmente.");
});

for (const width of [320, 768, 1024, 1440]) {
  test(`catálogo sem erros ou transbordamento em ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    for (const slug of ["overview", "colors", "typography", "spacing", "radius", "icons", "buttons", "menus", "navigation", "inputs", "dates", "selectors", "selection", "modals", "alerts", "tags", "tables", "cards"]) {
      await page.goto(`/design-system?item=${slug}`);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), slug).toBe(true);
      expect(await page.getByRole("main").evaluate((main) => main.scrollWidth <= main.clientWidth + 1), slug).toBe(true);
    }
    expect(errors).toEqual([]);
    if (width === 320) {
      await page.getByRole("button", { name: "Componentes", exact: true }).click();
      await page.getByRole("link", { name: "Botões", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Botões", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Componentes", exact: true })).toHaveAttribute("aria-expanded", "false");
    }
  });
}

test("controles alternam seleção parcial, única e switch pelo teclado", async ({ page }) => {
  await page.goto("/design-system?item=selection");
  const all = page.getByRole("checkbox", { name: "Selecionar todos" });
  await expect(all).toBeChecked({ indeterminate: true });
  await all.check();
  await expect(page.getByRole("checkbox", { name: "Relatórios" })).toBeChecked();
  await all.uncheck();
  await expect(page.getByRole("checkbox", { name: "Relatórios" })).not.toBeChecked();
  const toggle = page.getByRole("switch", { name: "Notificações por e-mail" });
  await toggle.focus(); await toggle.press("Space");
  await expect(toggle).not.toBeChecked();
  await page.getByRole("radio", { name: "Mensal" }).check();
  await expect(page.getByRole("radio", { name: "Mensal" })).toBeChecked();
});
