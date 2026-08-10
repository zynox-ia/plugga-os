import { expect, test } from "@playwright/test";

const MUTATION_TIMEOUT_MS = 15_000;

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
    await expect(page.getByRole("cell", { name: uniqueName, exact: true })).toBeVisible({
      timeout: MUTATION_TIMEOUT_MS,
    });

    // Second client with the same phone: signaled as a possible duplicate,
    // but still created (not blocked) — both rows must exist afterwards.
    await page.getByRole("button", { name: "+ Novo cliente" }).click();
    await page.getByLabel("Nome *").fill(`${uniqueName} (2)`);
    await page.getByLabel("Telefone", { exact: true }).fill(phone);
    await page.getByRole("button", { name: "Criar cliente" }).click();

    await expect(page.getByRole("heading", { name: "Cliente criado — confira antes de seguir" })).toBeVisible();

    // O painel de duplicados lista o PRIMEIRO cliente (o telefone agora casa
    // mesmo formatado), então o nome dele existe em duas tabelas. As asserções
    // de "as duas linhas existem" valem para a lista principal.
    const painelDeDuplicados = page.getByRole("table", {
      name: "Clientes já existentes que podem ser o mesmo cadastro",
    });
    await expect(painelDeDuplicados.getByRole("cell", { name: uniqueName, exact: true })).toBeVisible();

    const listaDeClientes = page.getByRole("table", { name: "Clientes cadastrados" });
    await expect(listaDeClientes.getByRole("cell", { name: uniqueName, exact: true })).toBeVisible();
    // A mutation atualiza a lista com a própria resposta da API; o timeout
    // folgado cobre apenas um runner carregado, não um segundo fetch obrigatório.
    await expect(
      listaDeClientes.getByRole("cell", { name: `${uniqueName} (2)`, exact: true }),
    ).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });

    // Pela célula exata, não por regex de prefixo: o nome acessível da linha do
    // "(2)" também começa com o nome do primeiro cliente.
    await listaDeClientes
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: uniqueName, exact: true }) })
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

    const listaDeClientes = page.getByRole("table", { name: "Clientes cadastrados" });
    const row = listaDeClientes
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: uniqueName, exact: true }) });
    await expect(row.getByRole("cell", { name: "Ativo", exact: true })).toBeVisible({
      timeout: MUTATION_TIMEOUT_MS,
    });

    await row.getByRole("button", { name: "Inativar" }).click();
    await expect(row.getByRole("cell", { name: "Inativo", exact: true })).toBeVisible({
      timeout: MUTATION_TIMEOUT_MS,
    });

    await row.getByRole("button", { name: "Ativar" }).click();
    await expect(row.getByRole("cell", { name: "Ativo", exact: true })).toBeVisible({
      timeout: MUTATION_TIMEOUT_MS,
    });
  });
});
