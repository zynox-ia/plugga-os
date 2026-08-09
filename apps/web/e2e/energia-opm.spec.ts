import { expect, test, type Page } from "@playwright/test";

import { EMPRESAS_POR_ID } from "../app/lib/organizacao";

// Rótulos direto do catálogo (organizacao.ts), casados pela rota: a primeira
// versão colava os textos e quebrou quando a sidebar foi rederivada do
// catálogo com outros nomes.
const ENERGIA = EMPRESAS_POR_ID.plugga.departamentos.find((d) => d.id === "energia-opm");

function rotulo(rota: string): string {
  const processo = ENERGIA?.processos.find((p) => p.rota === rota);
  if (!processo) throw new Error(`rota fora do catálogo Energia: ${rota}`);
  return processo.label;
}

// Sem `exact`: a tag "parcial" que a sidebar desenha dentro do botão entra no
// nome acessível ("Relatórios de economia parcial"), e a comparação estrita
// deixaria de casar justamente os processos ainda marcados como parciais.
async function navegar(page: Page, rota: string) {
  await page.goto("/");
  await page.locator(".sidebar-nav").getByRole("button", { name: rotulo(rota) }).click();
  await page.waitForURL((url) => url.pathname === rota);
}

test.describe("Energia & OPM — navegação e telas", () => {
  test("Migração Mercado Livre carrega via nav e mostra a fila", async ({ page }) => {
    await navegar(page, "/energia-opm/migracoes");
    await expect(page.getByRole("heading", { name: "Migrações Mercado Livre", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Nova migração" })).toBeVisible();
  });

  test("Ciclos mensais carrega via nav e mostra o kanban", async ({ page }) => {
    await navegar(page, "/energia-opm/ciclos");
    // exact: o h1 da página ("Ciclos mensais", do catálogo) colidiria com o h2
    // do card na comparação sem caixa do Playwright.
    await expect(page.getByRole("heading", { name: "Ciclos Mensais", exact: true })).toBeVisible();
  });

  test("Auditoria de faturas carrega via nav e mostra a lista", async ({ page }) => {
    await navegar(page, "/energia-opm/auditorias");
    await expect(page.getByRole("heading", { name: "Auditorias", exact: true })).toBeVisible();
  });

  test("Relatórios de economia carrega via nav e mostra o histórico agregado", async ({ page }) => {
    await navegar(page, "/energia-opm/relatorios");
    // exact: "Relatórios" é substring do h1 "Relatórios de economia".
    await expect(page.getByRole("heading", { name: "Relatórios", exact: true })).toBeVisible();
  });
});
