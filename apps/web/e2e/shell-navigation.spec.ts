import { expect, test } from "@playwright/test";
import type { UserAccess } from "@plugga/shared";

import { navGroupsForAccess } from "../app/lib/navigation";
import { EMPRESAS_POR_ID, GLOBAIS, VISAO_GERAL } from "../app/lib/organizacao";

const ITEMS = navGroupsForAccess().flatMap((group) => group.items);
/** Só o que tem tela navega; o resto permanece inativo. */
const NAVEGAVEIS = ITEMS.filter((item) => !item.disabled);

function nomeAcessivel(item: { label: string }): string {
  return item.label;
}

/**
 * Departamento nasce fechado: a barra chega enxuta e a pessoa abre o que usa.
 * Só o departamento da rota atual já vem aberto, para o item ativo não sumir.
 * Quem quiser ver os processos de um departamento precisa abri-lo primeiro —
 * é o que este ajudante faz, e é por isso que ele existe em vez de os testes
 * assumirem a árvore inteira desdobrada.
 */
async function abrirDepartamentos(page: import("@playwright/test").Page) {
  const cabecalhos = page.locator(".sidebar-nav .nav-parent[aria-expanded='false']");
  for (let i = await cabecalhos.count(); i > 0; i = await cabecalhos.count()) {
    await cabecalhos.first().click();
    // Uma por vez: a lista é reavaliada a cada clique porque abrir um
    // departamento muda o que está no DOM.
    if ((await cabecalhos.count()) >= i) break;
  }
}

test.describe("Plugga shell — smoke", () => {
  test("renders skip-link, brand lockup and the unified department tree", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".skip-link")).toHaveText("Pular para o conteúdo");
    await expect(page.locator(".brand-lockup img")).toBeVisible();

    for (const departamento of [
      ...EMPRESAS_POR_ID.plugga.departamentos,
      EMPRESAS_POR_ID.waze.departamentos.find((item) => item.id === "engenharia-obras")!,
    ]) {
      await expect(
        page.locator(".sidebar-nav .nav-parent", { hasText: departamento.label }),
      ).toBeVisible();
    }

    await abrirDepartamentos(page);

    for (const item of ITEMS) {
      await expect(
        page.locator(".sidebar-nav").getByRole("button", { name: nomeAcessivel(item), exact: true }),
      ).toBeVisible();
    }
  });

  test("departamento nasce fechado e abre no clique", async ({ page }) => {
    await page.goto("/");

    // O departamento é localizado pelo RÓTULO, não pelo estado. Um locator
    // por `[aria-expanded='false']` deixa de casar assim que o clique abre o
    // grupo, e `.first()` passaria a apontar para o próximo ainda fechado —
    // o teste checaria o elemento errado e falharia dizendo a verdade sobre
    // outra coisa.
    const fechado = page.locator(".sidebar-nav .nav-parent[aria-expanded='false']").first();
    await expect(fechado).toBeVisible();
    const rotulo = ((await fechado.locator(".nav-item-label").textContent()) ?? "").trim();

    const departamento = page.locator(".sidebar-nav .nav-parent", { hasText: rotulo });
    await departamento.click();
    await expect(departamento).toHaveAttribute("aria-expanded", "true");
  });

  // O processo planejado continua visível e inerte, sem etiqueta de status.
  test("processes without a screen are visible and not clickable", async ({ page }) => {
    await page.goto("/");
    await abrirDepartamentos(page);

    const pendente = ITEMS.find((item) => item.disabled);
    expect(pendente).toBeDefined();

    const botao = page
      .locator(".sidebar-nav")
      .getByRole("button", { name: nomeAcessivel(pendente!), exact: true });
    await expect(botao).toBeVisible();
    await expect(botao).toBeDisabled();
    await expect(page.locator(".sidebar-nav .nav-tag")).toHaveCount(0);
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
      await abrirDepartamentos(page);
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

test.describe("Navegação única", () => {
  test("mostra somente os departamentos permitidos e deduplica os compartilhados", () => {
    const acesso: UserAccess = {
      platformRoles: [],
      companies: [
        {
          companyId: "plugga",
          roles: [],
          departments: [
            { departmentId: "comercial-clientes", isManager: false },
            { departmentId: "financeiro", isManager: false },
          ],
        },
        {
          companyId: "waze",
          roles: [],
          departments: [
            { departmentId: "engenharia-obras", isManager: false },
            { departmentId: "financeiro", isManager: false },
          ],
        },
      ],
    };
    const departamentos = navGroupsForAccess(acesso).filter((group) => group.collapsible);

    expect(departamentos.map((group) => group.label)).toEqual(["Comercial", "Financeiro", "Engenharia"]);
    expect(departamentos.filter((group) => group.label === "Financeiro")).toHaveLength(1);
  });

  test("não mostra seletor nem repete Comercial ou Financeiro", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("group", { name: "Empresa ativa" })).toHaveCount(0);
    await expect(page.locator(".sidebar-nav .nav-parent", { hasText: "Engenharia" })).toBeVisible();
    await expect(page.locator(".sidebar-nav .nav-parent", { hasText: "Energia" })).toBeVisible();
    await expect(page.locator(".sidebar-nav .nav-parent", { hasText: "Comercial" })).toHaveCount(1);
    await expect(page.locator(".sidebar-nav .nav-parent", { hasText: "Financeiro" })).toHaveCount(1);
    await expect(page.locator(".sidebar-nav .nav-tag")).toHaveCount(0);
  });

  test("cabeçalho permanece no topo durante a rolagem do conteúdo", async ({ page }) => {
    await page.goto("/");
    const header = page.locator(".topbar");
    const yInicial = (await header.boundingBox())?.y;
    await page.locator(".main-content").evaluate((main) => { main.scrollTop = main.scrollHeight; });
    const rolagem = await page.locator(".main-content").evaluate((main) => main.scrollTop);

    expect(rolagem).toBeGreaterThan(0);
    expect((await header.boundingBox())?.y).toBe(yInicial);
  });

  test("visão geral permanece visível sem contexto global de empresa", async ({ page }) => {
    await page.goto("/");
    for (const processo of VISAO_GERAL) {
      const rotulo = processo.label;
      await expect(
        page.locator(".sidebar-nav").getByRole("button", { name: rotulo, exact: true }),
      ).toBeVisible();
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

  test("Engenharia navega sem propagar a antiga empresa global", async ({ page }) => {
    await page.goto("/?empresa=waze");
    await abrirDepartamentos(page);

    await page
      .locator(".sidebar-nav")
      .getByRole("button", { name: "Obras", exact: true })
      .click();
    await expect(page).toHaveURL((url) => url.pathname === "/engenharia", { timeout: 15_000 });
    expect(new URL(page.url()).searchParams.has("empresa")).toBe(false);
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
    expect(navGroupsForAccess().some((group) => group.label === "Engenharia")).toBe(true);
  });
});
