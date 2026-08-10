import { expect, test } from "@playwright/test";

import { navGroupsForEmpresa } from "../app/lib/navigation";
import { EMPRESAS_POR_ID, GLOBAIS, VISAO_GERAL } from "../app/lib/organizacao";

const PLUGGA = navGroupsForEmpresa("plugga").flatMap((group) => group.items);
const WAZE = navGroupsForEmpresa("waze").flatMap((group) => group.items);
/** Só o que tem tela navega; o resto aparece marcado como "em breve". */
const NAVEGAVEIS = PLUGGA.filter((item) => !item.disabled);

/**
 * O nome acessível do botão inclui a etiqueta de status renderizada dentro dele
 * ("parcial"/"em breve") — foi a etiqueta nascer e a suíte inteira passar a
 * procurar botões que não existem mais. Derivar o nome do catálogo faz um
 * rótulo novo quebrar aqui, não na CI três commits depois.
 */
function nomeAcessivel(item: { label: string; disabled?: boolean; badge?: string }): string {
  if (item.disabled) return `${item.label} em breve`;
  return item.badge ? `${item.label} ${item.badge}` : item.label;
}

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
        page.locator(".sidebar-nav").getByRole("button", { name: nomeAcessivel(item), exact: true }),
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
      .getByRole("button", { name: nomeAcessivel(pendente!), exact: true });
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
      await page
        .locator(".sidebar-nav")
        .getByRole("button", { name: nomeAcessivel(item), exact: true })
        .click();
      // O contrato deste smoke é o roteamento. toHaveURL observa a URL sem
      // acoplar o teste ao evento `load` das chamadas de dados da tela destino.
      await expect(page).toHaveURL((url) => url.pathname === item.id, { timeout: 15_000 });
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
    await expect(page).toHaveURL((url) => url.searchParams.get("empresa") === "waze", {
      timeout: 15_000,
    });
    await expect(waze).toHaveAttribute("aria-pressed", "true");
  });

  test("cada empresa mostra os seus departamentos e nenhum do outro lado", async ({ page }) => {
    await page.goto("/?empresa=waze");

    await expect(
      page.locator(".sidebar-nav .nav-parent", { hasText: "Engenharia" }),
    ).toBeVisible();
    await expect(
      page.locator(".sidebar-nav .nav-parent", { hasText: "Energia" }),
    ).toHaveCount(0);

    await page.goto("/");
    await expect(
      page.locator(".sidebar-nav .nav-parent", { hasText: "Energia" }),
    ).toBeVisible();
    await expect(
      page.locator(".sidebar-nav .nav-parent", { hasText: "Engenharia" }),
    ).toHaveCount(0);
  });

  // Dashboard e pendências são da empresa ativa, então acompanham o seletor.
  test("a visão geral aparece nas duas empresas", async ({ page }) => {
    for (const url of ["/", "/?empresa=waze"]) {
      await page.goto(url);
      for (const processo of VISAO_GERAL) {
        const rotulo =
          processo.status === "parcial" ? `${processo.label} parcial` : processo.label;
        await expect(
          page.locator(".sidebar-nav").getByRole("button", { name: rotulo, exact: true }),
        ).toBeVisible();
      }
    }
  });

  // As áreas de plataforma (jobs, integrações, administração) saíram da
  // sidebar: continuam roteáveis por URL, mas não competem com a estrutura
  // de departamentos no menu.
  test("a sidebar não lista as áreas de plataforma", async ({ page }) => {
    await page.goto("/");

    for (const processo of GLOBAIS) {
      await expect(
        page.locator(".sidebar-nav").getByRole("button", { name: processo.label, exact: true }),
      ).toHaveCount(0);
    }
  });

  test("a empresa ativa sobrevive à navegação pela sidebar", async ({ page }) => {
    await page.goto("/?empresa=waze");

    await page
      .locator(".sidebar-nav")
      .getByRole("button", { name: "Obras parcial", exact: true })
      .click();
    await expect(page).toHaveURL((url) => url.pathname === "/engenharia", { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get("empresa")).toBe("waze");
  });
});

test.describe("Mapa da estrutura", () => {
  test("lista as duas empresas com os seus departamentos", async ({ page }) => {
    await page.goto("/estrutura");

    // "Comercial" e "Financeiro" existem nas duas empresas: o mapa só é
    // legível se cada bloco for lido dentro do seu próprio cartão.
    for (const empresa of [EMPRESAS_POR_ID.plugga, EMPRESAS_POR_ID.waze]) {
      const cartao = page.locator(`.estrutura-empresa--${empresa.id}`);
      await expect(cartao.getByRole("heading", { name: empresa.nome, exact: true })).toBeVisible();
      for (const departamento of empresa.departamentos) {
        await expect(
          cartao.getByRole("heading", { name: departamento.label, exact: true }),
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
