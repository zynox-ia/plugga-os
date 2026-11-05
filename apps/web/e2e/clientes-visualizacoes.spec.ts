import { expect, test } from "@playwright/test";
import type { CreateClientResponse } from "@plugga/shared";

const prefixo = `Carteira E2E ${Date.now()}`;
const ids: string[] = [];

test.beforeAll(async ({ request, baseURL }) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  for (let i = 0; i < 8; i++) {
    const resposta = await request.post("/api/clientes", { headers: { origin: baseURL! }, data: {
      personType: i < 2 ? "pf" : "pj", name: `${prefixo} ${i + 1}`,
      email: `carteira-${Date.now()}-${i}@teste.local`, phone: `1199999000${i}`, city: "Cidade Sintética", state: "SP",
    } });
    expect(resposta.ok(), await resposta.text()).toBe(true);
    ids.push((await resposta.json() as CreateClientResponse).client.id);
  }
});

test.afterAll(async ({ request, baseURL }) => {
  for (const id of ids) {
    const resposta = await request.post(`/api/clientes/${id}/inactivate`, { headers: { origin: baseURL! }, data: {} });
    expect(resposta.ok()).toBe(true);
  }
});

test("cards usam bonequinho e o tipo junto à cidade; filtros acompanham a lista", async ({ page }) => {
  await page.goto(`/clientes?q=${encodeURIComponent(prefixo)}`);
  const cards = page.getByRole("tabpanel", { name: "Cards", exact: true });
  await expect(cards.getByRole("article")).toHaveCount(8);
  await expect(cards.locator("dl > div:first-child dt")).toHaveText(Array(8).fill("Telefone de contato"));
  await expect(cards.locator("svg.lucide-phone")).toHaveCount(8);
  const primeiro = cards.getByRole("article").first();
  await expect(primeiro.locator('header [data-avatar-cliente] svg')).toBeVisible();
  await expect(primeiro.locator('[data-avatar-cliente]')).toHaveText("");
  await expect(primeiro.locator("footer .avatar-pessoa--pequeno")).toBeVisible();
  const linha = primeiro.locator('[data-tipo-local]');
  await expect(linha).toContainText("Pessoa");
  await expect(linha).toContainText("Cidade Sintética / SP");
  await expect(page.getByText("Dados fictícios para aprovação do layout")).toHaveCount(0);
  await page.getByRole("combobox", { name: "Tipo de pessoa", exact: true }).click();
  await page.getByRole("option", { name: "Pessoa Física", exact: true }).click();
  await expect(cards.getByRole("article")).toHaveCount(2);
  const pessoaFisica = cards.getByRole("article").first();
  await expect(pessoaFisica.locator("dl dt")).toHaveText(["Telefone de contato", "Tipo de cadastro"]);
  await expect(pessoaFisica.locator("dl dd").first()).toHaveText(/\(11\).*000[01]$/);
  await expect(pessoaFisica.locator("svg.lucide-phone")).toHaveCount(1);
  await page.getByRole("tab", { name: "Lista", exact: true }).click();
  await expect(page.getByRole("table", { name: "Clientes cadastrados" }).locator("tbody tr")).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "Paginação da lista de clientes" })).toContainText("2 clientes");
});

test("menus dos filtros mantêm seleção e foco sem contorno azul nas opções", async ({ page }) => {
  await page.goto(`/clientes?q=${encodeURIComponent(prefixo)}`);
  for (const nome of ["Situação", "Tipo de pessoa"]) {
    const trigger = page.getByRole("combobox", { name: nome, exact: true });
    await trigger.click();
    const menu = page.getByRole("listbox", { name: nome, exact: true });
    const selecionada = menu.getByRole("option", { selected: true });
    await expect(selecionada).toBeFocused();
    await expect(selecionada.locator(".ui-select-indicator svg")).toBeVisible();
    const semContorno = () => menu.getByRole("option").evaluateAll((opcoes) => opcoes.every((opcao) => {
      const css = getComputedStyle(opcao);
      return css.outlineStyle === "none" && css.borderColor === "rgba(0, 0, 0, 0)";
    }));
    await expect.poll(semContorno).toBe(true);
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("option").nth(1)).toBeFocused();
    await expect.poll(semContorno).toBe(true);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  }
});

test("busca e situação consultam o cadastro e mantêm a lista selecionada", async ({ page }) => {
  await page.goto(`/clientes?q=${encodeURIComponent(prefixo)}`);
  await page.getByRole("tab", { name: "Lista", exact: true }).click();
  await page.getByLabel("Buscar cliente", { exact: true }).fill(`${prefixo} 1`);
  await page.getByRole("button", { name: "Buscar clientes", exact: true }).click();
  await expect(page.getByRole("table", { name: "Clientes cadastrados" }).locator("tbody tr")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Situação", exact: true }).click();
  await page.getByRole("option", { name: "Inativos", exact: true }).click();
  await expect(page.getByText("Nenhum cliente encontrado para a busca.")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Lista", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await expect(page.getByLabel("Buscar cliente", { exact: true })).toHaveValue("");
});

test("tag alterna a situação do cliente, persiste e funciona pelo teclado", async ({ page, request }) => {
  const nome = `${prefixo} 1`;
  await page.goto(`/clientes?q=${encodeURIComponent(nome)}`);
  await page.getByRole("button", { name: `Inativar cliente ${nome}`, exact: true }).click();
  await expect(page.getByRole("button", { name: `Ativar cliente ${nome}`, exact: true })).toHaveAttribute("aria-pressed", "false");
  expect((await (await request.get(`/api/clientes/${ids[0]}`)).json()).active).toBe(false);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: `Ativar cliente ${nome}`, exact: true }).press("Enter");
  await expect(page.getByRole("button", { name: `Inativar cliente ${nome}`, exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("button", { name: `Inativar cliente ${nome}`, exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("tag bloqueia cliques durante o envio e mantém a situação quando há erro", async ({ page }) => {
  const nome = `${prefixo} 2`;
  let liberar!: () => void;
  const respostaPendente = new Promise<void>((resolve) => { liberar = resolve; });
  let chamadas = 0;
  await page.route(`**/api/clientes/${ids[1]}/inactivate`, async (rota) => {
    chamadas++;
    await respostaPendente;
    await rota.fulfill({ status: 500, json: { message: "Falha sintética ao salvar situação." } });
  });
  await page.goto(`/clientes?q=${encodeURIComponent(nome)}`);
  const tag = page.getByRole("button", { name: `Inativar cliente ${nome}`, exact: true });
  try {
    await tag.click();
    await expect(tag).toBeDisabled();
    await expect.poll(() => chamadas).toBe(1);
    await tag.dispatchEvent("click");
    expect(chamadas).toBe(1);
  } finally { liberar(); }
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Falha sintética ao salvar situação.");
  await expect(tag).toBeEnabled();
  await expect(tag).toHaveAttribute("aria-pressed", "true");
});

test("tag da lista respeita o filtro de ativos sem abrir a ficha", async ({ page, request, baseURL }) => {
  const nome = `${prefixo} 3`;
  await page.goto(`/clientes?q=${encodeURIComponent(nome)}&active=true`);
  await page.getByRole("tab", { name: "Lista", exact: true }).click();
  await page.getByRole("button", { name: `Inativar cliente ${nome}`, exact: true }).press("Enter");
  await expect(page.getByText("Nenhum cliente encontrado para a busca.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Situação", exact: true })).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await (await request.get(`/api/clientes/${ids[2]}`)).json()).active).toBe(false);
  const restauracao = await request.post(`/api/clientes/${ids[2]}/activate`, { headers: { origin: baseURL! }, data: {} });
  expect(restauracao.ok()).toBe(true);
});

test("lista pagina sete clientes e preserva página e visualização ao abrir a ficha", async ({ page }) => {
  await page.goto(`/clientes?q=${encodeURIComponent(prefixo)}`);
  await page.getByRole("tab", { name: "Lista", exact: true }).click();
  const tabela = page.getByRole("table", { name: "Clientes cadastrados" });
  const paginacao = page.getByRole("navigation", { name: "Paginação da lista de clientes" });
  await expect(tabela.locator("tbody tr")).toHaveCount(7);
  await expect(paginacao).toContainText("1–7");
  await paginacao.getByRole("button", { name: "Próxima página", exact: true }).click();
  await expect(tabela.locator("tbody tr")).toHaveCount(1);
  await expect(paginacao).toContainText("8–8");
  await tabela.getByRole("button", { name: /^Ver ficha de/ }).first().click();
  await expect(page.getByRole("dialog", { name: /^Ficha de/ })).toBeVisible();
  await page.getByRole("button", { name: "Fechar ficha", exact: true }).click();
  await expect(paginacao).toContainText("8–8");
  await expect(page.getByRole("tab", { name: "Lista", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("combobox", { name: "Tipo de pessoa", exact: true }).click();
  await page.getByRole("option", { name: "Pessoa Física", exact: true }).click();
  await expect(paginacao).toContainText("1–2");
});

test("lista usa o cabeçalho de Pipelines e seleciona clientes entre páginas", async ({ page }) => {
  await page.goto(`/clientes?q=${encodeURIComponent(prefixo)}`);
  await page.getByRole("tab", { name: "Lista", exact: true }).click();
  const painel = page.getByRole("tabpanel", { name: "Lista", exact: true });
  await expect(painel.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();
  await expect(painel.getByText("Visão em lista", { exact: true })).toBeVisible();
  await painel.getByRole("button", { name: "Selecionar clientes", exact: true }).click();
  await painel.getByRole("checkbox", { name: "Selecionar todos os clientes visíveis", exact: true }).check();
  await expect(painel.getByRole("region", { name: "Clientes selecionados", exact: true })).toContainText("7 clientes selecionados");
  await painel.getByRole("button", { name: "Próxima página", exact: true }).click();
  await painel.getByRole("checkbox", { name: "Selecionar todos os clientes visíveis", exact: true }).check();
  await expect(painel.getByRole("region", { name: "Clientes selecionados", exact: true })).toContainText("8 clientes selecionados");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await painel.getByRole("button", { name: "Limpar seleção", exact: true }).click();
  await expect(painel.getByRole("region", { name: "Clientes selecionados", exact: true })).toHaveCount(0);
  await expect(painel.getByRole("button", { name: "Cancelar seleção", exact: true })).toBeFocused();
  await painel.getByRole("button", { name: "Cancelar seleção", exact: true }).click();
  await expect(painel.getByRole("checkbox")).toHaveCount(0);
});

test("lista ordena clientes sem alterar a seleção ou abrir a ficha", async ({ page }) => {
  await page.goto(`/clientes?q=${encodeURIComponent(prefixo)}`);
  await page.getByRole("tab", { name: "Lista", exact: true }).click();
  const tabela = page.getByRole("table", { name: "Clientes cadastrados" });
  await page.getByRole("button", { name: "Selecionar clientes", exact: true }).click();
  await page.getByRole("checkbox", { name: `Selecionar ${prefixo} 1`, exact: true }).check();
  await tabela.getByRole("button", { name: "Cliente", exact: true }).click();
  await expect(tabela.locator("thead th").first()).toHaveAttribute("aria-sort", "descending");
  await expect(tabela.locator("tbody tr").first()).toContainText(`${prefixo} 8`);
  await expect(tabela.locator("tbody tr").first().locator("[data-avatar-cliente] svg")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Clientes selecionados", exact: true })).toContainText("1 cliente selecionado");
  await page.getByRole("button", { name: "Próxima página", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: `Selecionar ${prefixo} 1`, exact: true })).toBeChecked();
});

test("cards e lista usam o mesmo avatar quadrado e o menu abre sem cortar nem abrir a ficha", async ({ page, request, baseURL }) => {
  await page.goto(`/clientes?q=${encodeURIComponent(prefixo)}`);
  const estiloAvatar = (elemento: HTMLElement | SVGElement) => {
    const estilo = getComputedStyle(elemento);
    return { width: estilo.width, height: estilo.height, borderRadius: estilo.borderRadius, borderColor: estilo.borderColor, color: estilo.color, background: estilo.backgroundColor };
  };
  const avatarCard = await page.getByRole("article").first().locator("[data-avatar-cliente]").evaluate(estiloAvatar);
  await page.getByRole("tab", { name: "Lista", exact: true }).click();
  const linha = page.getByRole("table").locator("tbody tr").last();
  const avatar = linha.locator("[data-avatar-cliente]");
  expect(await avatar.evaluate(estiloAvatar)).toEqual(avatarCard);
  expect(await avatar.evaluate((elemento) => {
    const estilo = getComputedStyle(elemento);
    return parseFloat(estilo.borderRadius) < elemento.getBoundingClientRect().width / 2;
  })).toBe(true);
  const trigger = linha.getByRole("button", { name: `Ações de ${prefixo} 7`, exact: true });
  await trigger.click();
  const menu = page.getByRole("menu", { name: `Ações de ${prefixo} 7`, exact: true });
  await expect(menu).toBeVisible();
  const limitesMenu = (await menu.boundingBox())!;
  expect(limitesMenu.y).toBeGreaterThanOrEqual(0);
  expect(limitesMenu.y + limitesMenu.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Ver ficha", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Inativar cliente", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole("menuitem", { name: "Inativar cliente", exact: true }).click();
  await expect(linha.getByRole("button", { name: `Ativar cliente ${prefixo} 7`, exact: true })).toBeVisible();
  await trigger.click();
  await menu.getByRole("menuitem", { name: "Ver ficha", exact: true }).click();
  const ficha = page.getByRole("dialog", { name: `Ficha de ${prefixo} 7`, exact: true });
  await expect(ficha).toBeVisible();
  await expect.poll(() => ficha.evaluate((elemento) => elemento.contains(document.activeElement))).toBe(true);
  await page.getByRole("button", { name: "Fechar ficha", exact: true }).click();
  await expect(trigger).toBeFocused();
  const restauracao = await request.post(`/api/clientes/${ids[6]}/activate`, { headers: { origin: baseURL! }, data: {} });
  expect(restauracao.ok()).toBe(true);
});

test("lista preserva o respiro das linhas com ajuste discreto no cabeçalho", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/clientes?q=${encodeURIComponent(prefixo)}`);
  await page.getByRole("tab", { name: "Lista", exact: true }).click();
  const regiao = page.getByRole("region", { name: "Lista de clientes", exact: true });
  await expect(regiao.locator("tbody tr")).toHaveCount(7);
  const linha = (await regiao.locator("tbody tr").first().boundingBox())!;
  expect(linha.height).toBeGreaterThanOrEqual(60);
  const cabecalho = (await page.locator(".lista-negocios-card .card-heading").boundingBox())!;
  expect(cabecalho.height).toBeGreaterThanOrEqual(58);
  expect(cabecalho.height).toBeLessThanOrEqual(62);
  await expect.poll(() => regiao.evaluate((elemento) => elemento.scrollHeight - elemento.clientHeight)).toBeLessThanOrEqual(1);
});

test("painel e paginação cabem na tela com o rodapé padrão do Agent", async ({ page }) => {
  await page.goto(`/clientes?q=${encodeURIComponent(prefixo)}`);
  await expect(page.getByRole("button", { name: "Agent", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Lista", exact: true }).click();
  for (const tamanho of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(tamanho);
    const paginacao = page.getByRole("navigation", { name: "Paginação da lista de clientes" });
    const agente = page.getByRole("button", { name: "Agent", exact: true });
    await expect(agente).toBeVisible();
    await expect(paginacao).toBeVisible();
    const limites = (await paginacao.boundingBox())!;
    const rodape = (await agente.locator("..").boundingBox())!;
    expect(limites.y + limites.height).toBeLessThanOrEqual(rodape.y);
    expect(limites.y + limites.height).toBeLessThanOrEqual(tamanho.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Agent", exact: true })).toBeVisible();
});
