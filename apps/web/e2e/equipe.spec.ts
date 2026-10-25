import { expect, test } from "@playwright/test";

/**
 * Configurações → Equipe e acessos, pela sessão do admin semeado.
 *
 * Cobre o que só o navegador prova: a seção deixou de ser "em breve", a lista
 * chega da API real e a área permanece concentrada na tabela de equipe. As regras de escopo do gestor são exercitadas
 * no e2e da API (apps/api/test/team.e2e.spec.ts), onde dá para criar cada
 * perfil sem depender do estado do banco local.
 */

// Cada spec tem o seu IP sintético: os logins da suíte saem todos desta mesma
// máquina e sem isso dividiriam o balde de 10 req/60s do /auth/login.
test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.205" } });

const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@plugga.local";

async function abrirEquipe(page: import("@playwright/test").Page) {
  await page.goto("/configuracoes");
  await page.getByRole("tab", { name: "Equipe e acessos" }).click();
}

test.describe("Configurações → Equipe e acessos", () => {
  test("lista a equipe e mostra o próprio admin com acesso de plataforma", async ({ page }) => {
    await abrirEquipe(page);

    const navegacao = page.locator(".config-nav");
    await expect(page.getByRole("heading", { name: "Equipe e acessos" })).toBeVisible();
    await expect(navegacao).toHaveCSS("display", "flex");
    const navBox = await navegacao.boundingBox();
    const headingBox = await page.getByRole("heading", { name: "Equipe e acessos" }).boundingBox();
    expect(navBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    expect(navBox!.y).toBeLessThan(headingBox!.y);
    const linha = page.locator("tbody tr", { hasText: adminEmail });
    await expect(linha).toBeVisible();
    await expect(linha).toContainText("Administração da plataforma");
  });

  test("o admin não pode desativar a si mesmo pela própria lista", async ({ page }) => {
    await abrirEquipe(page);

    const linha = page.locator("tbody tr", { hasText: adminEmail });
    await expect(linha.getByRole("button", { name: "Desativar" })).toHaveCount(0);
  });

  test("abre o novo acesso em diálogo, sem painel abaixo da tabela", async ({ page }) => {
    await abrirEquipe(page);

    await expect(page.getByText("Você administra a plataforma", { exact: false })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Novo acesso" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Pessoas com acesso ao sistema" })).toBeVisible();
    await page.getByRole("button", { name: "Novo acesso" }).click();
    await expect(page.getByRole("heading", { name: "Novo acesso" })).toBeVisible();
  });

  test("concentra as ações do membro em detalhes e menu contextual", async ({ page }) => {
    await abrirEquipe(page);

    const linha = page.locator("tbody tr", { hasText: adminEmail });
    await expect(linha.getByRole("button", { name: "Visualizar membro" })).toBeVisible();
    await linha.getByRole("button", { name: /Mais ações para/ }).click();
    await expect(page.getByRole("menuitem", { name: "Mudar acesso" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Enviar link de acesso" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Desativar acesso" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Remover membro" })).toBeVisible();
  });
});
