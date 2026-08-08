import { expect, test } from "@playwright/test";

import { navGroupsForEmpresa } from "../app/lib/navigation";
import { EMPRESAS_POR_ID, GLOBAIS, VISAO_GERAL } from "../app/lib/organizacao";

const PLUGGA = navGroupsForEmpresa("plugga").flatMap((group) => group.items);
const WAZE = navGroupsForEmpresa("waze").flatMap((group) => group.items);
/** Só o que tem tela navega; o resto aparece marcado como "em breve". */
const NAVEGAVEIS = PLUGGA.filter((item) => !item.disabled);

test.describe("Plugga shell — smoke", () => {
  test("renders skip-link, brand lockup and the Plugga department tree", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".skip-link")).toHaveText("Pular para o conteúdo");
    await expect(page.locator(".brand-lockup img")).toBeVisible();

    for (const departamento of EMPRESAS_POR_ID.plugga.departamentos) {
      await expect(
        page.locator(".sidebar-nav .nav-parent", { hasText: departamento.label }),
      ).toBeVisible();
    }

    for (const item of PLUGGA) {
      await expect(
        page.locator(".sidebar-nav").getByRole("button", { name: item.label, exact: true }),
      ).toBeVisible();
    }
  });

  // A estrutura só é útil se o que ainda não existe estiver visível e inerte:
  // esconder daria a impressão de que o desenho não foi combinado, e deixar
  // clicável levaria a 404.
  test("processes without a screen are shown, marked and not clickable", async ({ page }) => {
    await page.goto("/");

    const pendente = PLUGGA.find((item) => item.disabled);
    expect(pendente).toBeDefined();

    const botao = page
      .locator(".sidebar-nav")
      .getByRole("button", { name: pendente!.label, exact: true });
    await expect(botao).toBeVisible();
    await expect(botao).toBeDisabled();
    await expect(botao.locator(".nav-tag")).toHaveText("em breve");
  });

  test("mobile: sidebar is off-canvas and toggled via aria-expanded menu button", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    const toggle = page.locator(".menu-toggle");
    const sidebar = page.locator(".sidebar");

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(sidebar).not.toHaveClass(/sidebar--open/);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(sidebar).toHaveClass(/sidebar--open/);
  });

  for (const item of NAVEGAVEIS) {
    test(`nav: "${item.label}" routes to ${item.id}`, async ({ page }) => {
      await page.goto("/");
      await page.locator(".sidebar-nav").getByRole("button", { name: item.label, exact: true }).click();
      await page.waitForURL((url) => url.pathname === item.id);
      expect(new URL(page.url()).pathname).toBe(item.id);
    });
  }
});

test.describe("Seletor de empresa", () => {
  test("troca o contexto e a URL carrega a empresa ativa", async ({ page }) => {
    await page.goto("/");

    const waze = page.getByRole("button", { name: "Waze Energia" });
    await expect(waze).toHaveAttribute("aria-pressed", "false");

    await waze.click();
    await page.waitForURL((url) => url.searchParams.get("empresa") === "waze");
    await expect(waze).toHaveAttribute("aria-pressed", "true");
  });

  test("cada empresa mostra os seus departamentos e nenhum do outro lado", async ({ page }) => {
    await page.goto("/?empresa=waze");

    await expect(
      page.locator(".sidebar-nav .nav-parent", { hasText: "Engenharia, Projetos & Obras" }),
    ).toBeVisible();
    await expect(
      page.locator(".sidebar-nav .nav-parent", { hasText: "Operação de Energia / OPM" }),
    ).toHaveCount(0);

    await page.goto("/");
    await expect(
      page.locator(".sidebar-nav .nav-parent", { hasText: "Operação de Energia / OPM" }),
    ).toBeVisible();
    await expect(
      page.locator(".sidebar-nav .nav-parent", { hasText: "Engenharia, Projetos & Obras" }),
    ).toHaveCount(0);
  });

  // Usuários, jobs, integrações e o desenho dos processos servem as duas
  // empresas — some-los ao trocar de contexto seria mentira estrutural.
  test("a área de plataforma aparece nas duas empresas", async ({ page }) => {
    for (const url of ["/", "/?empresa=waze"]) {
      await page.goto(url);
      for (const processo of [...VISAO_GERAL, ...GLOBAIS]) {
        await expect(
          page.locator(".sidebar-nav").getByRole("button", { name: processo.label, exact: true }),
        ).toBeVisible();
      }
    }
  });

  test("a empresa ativa sobrevive à navegação pela sidebar", async ({ page }) => {
    await page.goto("/?empresa=waze");

    await page.locator(".sidebar-nav").getByRole("button", { name: "Integrações", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/integracoes");
    expect(new URL(page.url()).searchParams.get("empresa")).toBe("waze");
  });
});

test.describe("Mapa da estrutura", () => {
  test("lista as duas empresas com os seus departamentos", async ({ page }) => {
    await page.goto("/estrutura");

    for (const empresa of [EMPRESAS_POR_ID.plugga, EMPRESAS_POR_ID.waze]) {
      await expect(page.getByRole("heading", { name: empresa.nome, exact: true })).toBeVisible();
      for (const departamento of empresa.departamentos) {
        await expect(
          page.getByRole("heading", { name: departamento.label, exact: true }),
        ).toBeVisible();
      }
    }
  });

  test("Waze não tem departamento de compras próprio — compras é do financeiro", async ({ page }) => {
    await page.goto("/estrutura");

    const financeiro = EMPRESAS_POR_ID.waze.departamentos.find((d) => d.id === "financeiro");
    expect(financeiro?.processos.some((p) => p.label === "Compras")).toBe(true);
    expect(EMPRESAS_POR_ID.waze.departamentos).toHaveLength(3);
    expect(WAZE.length).toBeGreaterThan(0);
  });
});
