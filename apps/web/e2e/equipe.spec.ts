import { expect, test } from "@playwright/test";

/**
 * Configurações → Equipe e acessos, pela sessão do admin semeado.
 *
 * Cobre o que só o navegador prova: a seção deixou de ser "em breve", a lista
 * chega da API real e o formulário de convite oferece as duas empresas para
 * quem administra a plataforma. As regras de escopo do gestor são exercitadas
 * no e2e da API (apps/api/test/team.e2e.spec.ts), onde dá para criar cada
 * perfil sem depender do estado do banco local.
 */

// Cada spec tem o seu IP sintético: os logins da suíte saem todos desta mesma
// máquina e sem isso dividiriam o balde de 10 req/60s do /auth/login.
test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.205" } });

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@plugga.local";

async function abrirEquipe(page: import("@playwright/test").Page) {
  await page.goto("/configuracoes");
  await page.getByRole("button", { name: "Equipe e acessos" }).click();
}

test.describe("Configurações → Equipe e acessos", () => {
  test("lista a equipe e mostra o próprio admin com acesso de plataforma", async ({ page }) => {
    await abrirEquipe(page);

    await expect(page.getByRole("heading", { name: "Equipe e acessos" })).toBeVisible();
    const linha = page.locator("tbody tr", { hasText: adminEmail });
    await expect(linha).toBeVisible();
    await expect(linha).toContainText("Administração da plataforma");
  });

  test("o admin não pode desativar a si mesmo pela própria lista", async ({ page }) => {
    await abrirEquipe(page);

    const linha = page.locator("tbody tr", { hasText: adminEmail });
    await expect(linha.getByRole("button", { name: "Desativar" })).toHaveCount(0);
  });

  test("o convite oferece as duas empresas, cada uma com os seus departamentos", async ({
    page,
  }) => {
    await abrirEquipe(page);
    await page.getByRole("button", { name: "Convidar pessoa" }).click();

    const plugga = page.locator("fieldset", { hasText: "Plugga" }).first();
    await expect(plugga).toBeVisible();
    await expect(page.locator("fieldset", { hasText: "Waze Energia" }).first()).toBeVisible();

    // Empresa desmarcada não mostra papel nem departamento: eles só existem
    // dentro dela, e oferecê-los antes sugeriria um acesso solto.
    await expect(plugga).toContainText("Sem acesso a esta empresa");
    await plugga.getByRole("checkbox").first().check();
    await expect(plugga).toContainText("Papéis nesta empresa");
    await expect(plugga.getByText("Energia", { exact: true })).toBeVisible();
    await expect(plugga.getByText("Engenharia", { exact: true })).toHaveCount(0);
  });
});
