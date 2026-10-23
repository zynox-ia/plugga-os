import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context, page, baseURL }) => {
  await context.addCookies([{ name: "plugga_session", value: "simulada", url: baseURL! }]);
  await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.goto("/design-system?item=modals");
});

test("modal completo conserva escolhas ao salvar e descarta ao cancelar", async ({ page }) => {
  const trigger = page.getByRole("button", { name: "Abrir formulário", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Editar projeto", exact: true });
  await dialog.getByRole("textbox", { name: "Nome do projeto" }).fill("Projeto completo");
  await dialog.getByRole("combobox", { name: "Categoria", exact: true }).click();
  await page.getByRole("option", { name: "Mercado livre", exact: true }).click();
  const distributor = dialog.getByRole("combobox", { name: "Distribuidora" });
  await distributor.fill("sul");
  await distributor.press("ArrowDown");
  await distributor.press("Enter");
  await dialog.getByRole("button", { name: "Serviços: 1 selecionados" }).click();
  await dialog.getByRole("menuitemcheckbox", { name: "Geração distribuída" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Observações" }).fill("Revisar o documento de demonstração.");
  await dialog.getByRole("radio", { name: "Alta", exact: true }).check();
  await dialog.getByRole("checkbox", { name: "Solicitar revisão" }).check();
  await dialog.getByRole("switch", { name: "Receber atualizações" }).uncheck();
  await dialog.getByLabel("Anexos", { exact: true }).setInputFiles({ name: "demonstracao.txt", mimeType: "text/plain", buffer: Buffer.from("Arquivo sintético de teste.") });
  await expect(dialog.getByText("demonstracao.txt", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await trigger.click();
  await expect(dialog.getByRole("combobox", { name: "Categoria", exact: true })).toHaveText("Mercado livre");
  await expect(distributor).toHaveValue("Distribuidora Sul");
  await expect(dialog.getByRole("radio", { name: "Alta", exact: true })).toBeChecked();
  await expect(dialog.getByRole("switch", { name: "Receber atualizações" })).not.toBeChecked();
  await expect(dialog.getByText("demonstracao.txt", { exact: true })).toBeVisible();
  await dialog.getByRole("textbox", { name: "Nome do projeto" }).fill("Não salvar");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog.getByRole("textbox", { name: "Nome do projeto" })).toHaveValue("Projeto completo");
});

test("arrastar arquivos permite remover e adicionar novamente sem enviar à rede", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => { if (["POST", "PUT", "PATCH"].includes(request.method())) writes.push(request.url()); });
  await page.getByRole("button", { name: "Abrir formulário", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Editar projeto", exact: true });
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(["Arquivo sintético"], "arrastado.txt", { type: "text/plain" }));
    return data;
  });
  await dialog.locator(".ui-file-dropzone").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(dialog.getByText("arrastado.txt", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Remover arrastado.txt", exact: true }).click();
  await expect(dialog.getByText("arrastado.txt", { exact: true })).toHaveCount(0);
  await dialog.locator(".ui-file-dropzone").dispatchEvent("drop", { dataTransfer: transfer });
  await expect(dialog.getByText("arrastado.txt", { exact: true })).toHaveCount(1);
  await transfer.dispose();
  expect(writes).toEqual([]);
});

test("calendário e menu fecham com Escape sem fechar o formulário e erros impedem salvar", async ({ page }) => {
  await page.getByRole("button", { name: "Abrir formulário", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Editar projeto", exact: true });
  const category = dialog.getByRole("combobox", { name: "Categoria", exact: true });
  await category.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(category).toBeFocused();
  const trigger = dialog.getByRole("button", { name: "Abrir calendário de Data de início" });
  await trigger.click();
  const calendar = page.getByRole("dialog", { name: "Calendário de Data de início", exact: true });
  await expect(calendar).toBeVisible();
  await calendar.getByRole("button", { name: "23 de outubro de 2026", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Data de início", exact: true })).toHaveValue("23/10/2026");
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeFocused();
  await dialog.getByRole("textbox", { name: "Nome do projeto" }).clear();
  await dialog.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Nome do projeto" })).toHaveAccessibleDescription("Erro: Informe o nome do projeto.");
  await expect(dialog).toBeVisible();
});

for (const width of [320, 768, 1440]) {
  test(`títulos com ícones e rodapé acessível em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    for (const heading of await page.locator("main h1, main h2").all()) {
      await expect(heading.locator(".ui-heading-icon svg")).toHaveCount(1);
    }
    const header = await page.locator(".ds-page-header").boundingBox();
    const section = await page.locator(".ds-section > header").first().boundingBox();
    expect(section!.y - header!.y - header!.height).toBeLessThanOrEqual(20);
    await page.getByRole("button", { name: "Abrir formulário", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Editar projeto", exact: true });
    const cancel = dialog.getByRole("button", { name: "Cancelar", exact: true });
    const save = dialog.getByRole("button", { name: "Salvar alterações", exact: true });
    const footer = dialog.locator(".ui-dialog-footer");
    const footerBox = (await footer.boundingBox())!;
    const cancelBox = (await cancel.boundingBox())!;
    const saveBox = (await save.boundingBox())!;
    expect(cancelBox.x - footerBox.x).toBeLessThanOrEqual(24);
    expect(cancelBox.x + cancelBox.width).toBeLessThanOrEqual(saveBox.x);
    expect(saveBox.y + saveBox.height).toBeLessThanOrEqual(900);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("modal-completo.png") });
    await dialog.getByRole("button", { name: "Selecionar arquivos", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("modal-anexos.png") });
    await cancel.click();
    await page.getByRole("button", { name: "Abrir confirmação", exact: true }).click();
    await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}
