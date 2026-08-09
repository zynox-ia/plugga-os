import { expect, test } from "@playwright/test";

test.describe("Clientes — busca e ficha", () => {
  test("busca sem correspondência mostra o estado vazio, não dado simulado", async ({ page }) => {
    await page.goto("/clientes?q=zzz-sem-correspondencia-zzz");
    await expect(page.getByText("Nenhum cliente encontrado para os filtros atuais.")).toBeVisible();
  });

  test("cria um cliente, sinaliza duplicado sem bloquear, e abre a ficha com os placeholders certos", async ({ page }) => {
    await page.goto("/clientes");
    await expect(page.getByRole("heading", { name: "Buscar clientes" })).toBeVisible();

    const uniqueName = `Cliente E2E ${Date.now()}`;
    const phone = "+55 92 90000-1234";

    // First client: no duplicate yet.
    await page.getByRole("button", { name: "+ Novo cliente" }).click();
    await page.getByLabel("Nome *").fill(uniqueName);
    // exact: o rótulo do filtro de busca ("Nome, empresa, telefone ou
    // identificador") também contém "telefone", e getByLabel casa substring.
    await page.getByLabel("Telefone", { exact: true }).fill(phone);
    await page.getByRole("button", { name: "Criar cliente" }).click();
    await expect(page.getByRole("cell", { name: uniqueName, exact: true })).toBeVisible();

    // Second client with the same phone: signaled as a possible duplicate,
    // but still created (not blocked) — both rows must exist afterwards.
    await page.getByRole("button", { name: "+ Novo cliente" }).click();
    await page.getByLabel("Nome *").fill(`${uniqueName} (2)`);
    await page.getByLabel("Telefone", { exact: true }).fill(phone);
    await page.getByRole("button", { name: "Criar cliente" }).click();

    await expect(page.getByRole("heading", { name: "Cliente criado — confira antes de seguir" })).toBeVisible();
    await expect(page.getByRole("cell", { name: uniqueName, exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: `${uniqueName} (2)`, exact: true })).toBeVisible();

    await page
      .getByRole("row", { name: new RegExp(`^${uniqueName}\\s`) })
      .getByRole("link", { name: "Ver ficha" })
      .click();
    await expect(page).toHaveURL(/\/clientes\/[^/]+$/);
    await expect(page.getByRole("heading", { name: uniqueName, exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Financeiro" }).click();
    await expect(page.getByText(/ainda não foi implementado neste bloco/)).toBeVisible();

    await page.getByRole("tab", { name: "Documentos" }).click();
    await expect(page.getByText(/ainda não foi implementado neste bloco/)).toBeVisible();

    await page.getByRole("tab", { name: "Energia & OPM" }).click();
    await expect(page.getByText(/não tem modelo de domínio implementado/)).toBeVisible();

    await page.getByRole("tab", { name: "PluggaMob" }).click();
    await expect(page.getByText(/sem vínculo PluggaMob/)).toBeVisible();
  });

  test("inativa e reativa um cliente a partir da lista", async ({ page }) => {
    await page.goto("/clientes");

    const uniqueName = `Cliente E2E Status ${Date.now()}`;
    await page.getByRole("button", { name: "+ Novo cliente" }).click();
    await page.getByLabel("Nome *").fill(uniqueName);
    await page.getByRole("button", { name: "Criar cliente" }).click();

    const row = page.getByRole("row", { name: new RegExp(`^${uniqueName}\\s`) });
    await expect(row.getByText("Ativo")).toBeVisible();

    await row.getByRole("button", { name: "Inativar" }).click();
    await expect(row.getByText("Inativo")).toBeVisible();

    await row.getByRole("button", { name: "Ativar" }).click();
    await expect(row.getByText("Ativo")).toBeVisible();
  });
});
