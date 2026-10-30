import { expect, test, type Page } from "@playwright/test";

const MUTATION_TIMEOUT_MS = 15_000;

/**
 * O seletor que a pessoa vê, pelo papel acessível. `getByLabel` também acha
 * cópias escondidas: no build de produção, um recarregamento sob carga às vezes
 * deixa órfão o bloco de streaming do React (`<div hidden id="S:0">`) com uma
 * segunda cópia da tela, e o teste falhava por modo estrito sem nada errado no
 * que aparece na tela.
 */
function seletorDePipeline(page: Page) {
  return page.getByRole("combobox", { name: "Selecionar pipeline" });
}

/**
 * Cria um pipeline com toda a equipe comercial disponível. Na CI, as contas de
 * exemplo do seed (SEED_SAMPLE_TEAM) dão alguém com papel comercial na Plugga.
 */
async function criarPipeline(page: Page, nome: string): Promise<void> {
  await page.goto("/comercial/pipelines");
  await expect(page.getByRole("heading", { level: 1, name: "Pipelines" })).toBeVisible();
  const modal = page.getByRole("dialog", { name: "Configurar pipelines" });
  const criarPrimeiro = page.getByRole("button", { name: "Criar pipeline" });
  if (await criarPrimeiro.isVisible()) {
    await criarPrimeiro.click();
  } else {
    await page.getByRole("button", { name: "Configurar pipelines" }).click();
    await modal.getByRole("button", { name: "Novo pipeline" }).click();
  }
  await modal.getByLabel(/^Nome do pipeline( \*| \(obrigatório\))$/).fill(nome);

  // Equipe por funil saiu: quem pode ser responsável vem de Equipe e Acessos
  // (SEED_SAMPLE_TEAM=true traz alguém do CRM), então o pipeline só escolhe a empresa.
  await modal.getByRole("radio", { name: /^Plugga/ }).check();
  await modal.getByRole("button", { name: "Criar pipeline" }).click();
  await expect(modal.getByRole("status").filter({ hasText: "Alterações salvas." })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
  await modal.getByRole("button", { name: "Fechar" }).click();
  const seletor = seletorDePipeline(page);
  const id = await seletor.getByRole("option", { name: new RegExp(nome) }).getAttribute("value");
  expect(id).not.toBeNull();
  await seletor.selectOption(id!);
  await expect(page.getByRole("region", { name: `Negócios do pipeline ${nome}` })).toBeVisible();
}

test.describe("Negócios no quadro do pipeline (PLU-271)", () => {
  test("cria negócio com cliente novo, muda de etapa, perde com revisita e só exclui a etapa com destino", async ({ page }) => {
    const marca = Date.now();
    const pipeline = `Negócios E2E ${marca}`;
    const titulo = `Hotel E2E ${marca} — usina 120 kWp`;
    await criarPipeline(page, pipeline);

    // Novo negócio já na coluna Qualificação, cadastrando o cliente sem sair.
    await page.getByRole("button", { name: "Novo negócio em Qualificação" }).click();
    const novo = page.getByRole("dialog", { name: "Novo negócio" });
    await expect(novo.getByLabel(/^Etapa inicial( \*| \(obrigatório\))$/)).toHaveValue(/.+/);
    await novo.getByRole("button", { name: "+ Novo cliente" }).click();
    const cliente = page.getByRole("dialog", { name: "Novo cliente" });
    await cliente.getByLabel(/^Nome( \*| \(obrigatório\))$/).fill(`Hotel Mirante E2E ${marca}`);
    await cliente.getByLabel("Telefone", { exact: true }).fill("(92) 99999-0003");
    await cliente.getByRole("button", { name: "Cadastrar cliente" }).click();
    await expect(novo.getByText(`Hotel Mirante E2E ${marca}`)).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
    await novo.getByLabel(/^Título( \*| \(obrigatório\))$/).fill(titulo);
    await novo.getByLabel("Valor").fill("480.000,00");
    await novo.getByRole("button", { name: "Criar negócio" }).click();

    const card = page.getByRole("article", { name: `Negócio ${titulo}` });
    await expect(card).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
    await expect(page.getByRole("region", { name: "Qualificação" }).getByRole("article", { name: `Negócio ${titulo}` })).toBeVisible();
    await expect(card.getByText("R$ 480 mil")).toBeVisible();

    // Muda de etapa pelo menu do card (a alternativa ao arrastar) e continua lá depois de recarregar.
    const viewportOriginal = page.viewportSize();
    expect(viewportOriginal).not.toBeNull();
    // Mantém a barra lateral visível para o recorte do quadro ocorrer dentro da janela.
    await page.setViewportSize({ width: 840, height: viewportOriginal!.height });
    const quadroColunas = page.getByRole("region", { name: `Negócios do pipeline ${pipeline}` }).locator(".quadro-colunas");
    const botaoAcoes = card.getByRole("button", { name: `Ações de ${titulo}` });
    await botaoAcoes.click();
    const menuAcoes = page.getByRole("menu", { name: `Ações de ${titulo}` });
    await expect(menuAcoes).toBeVisible();
    const distanciaParaRecortar = await botaoAcoes.evaluate((botao) => {
      const quadro = botao.closest(".quadro-colunas");
      if (!quadro) throw new Error("O botão de ações precisa estar dentro do quadro Kanban.");
      return botao.getBoundingClientRect().right - quadro.getBoundingClientRect().left + 1;
    });
    await quadroColunas.evaluate((quadro, distancia) => {
      quadro.scrollLeft += distancia;
    }, distanciaParaRecortar);
    await expect.poll(() => botaoAcoes.evaluate((botao) => {
      const botaoRect = botao.getBoundingClientRect();
      const quadroRect = botao.closest(".quadro-colunas")!.getBoundingClientRect();
      const aindaNaJanela = botaoRect.right > 0 && botaoRect.left < window.innerWidth;
      const recortadoPeloQuadro = botaoRect.right <= quadroRect.left || botaoRect.left >= quadroRect.right;
      return aindaNaJanela && recortadoPeloQuadro;
    })).toBe(true);
    await expect(botaoAcoes).toHaveAttribute("aria-expanded", "false");
    await expect(menuAcoes).toHaveCount(0);
    await quadroColunas.evaluate((quadro) => {
      quadro.scrollLeft = 0;
    });
    await page.setViewportSize(viewportOriginal!);
    await expect(botaoAcoes).toBeVisible();

    await botaoAcoes.click();
    const moverParaProposta = page.waitForResponse((response) =>
      new URL(response.url()).pathname.match(/^\/api\/negocios\/[^/]+\/etapa$/) !== null
      && response.request().method() === "POST"
      && response.status() === 200,
    );
    await page.getByRole("menuitem", { name: "Proposta" }).click();
    await moverParaProposta;
    await expect(page.getByRole("region", { name: "Proposta" }).getByRole("article", { name: `Negócio ${titulo}` })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
    await page.reload();
    await expect(page.getByRole("region", { name: "Proposta" }).getByRole("article", { name: `Negócio ${titulo}` })).toBeVisible();

    // Perder exige motivo; "Prazo inadequado" exige a data de revisita.
    await card.getByRole("button", { name: `Ações de ${titulo}` }).click();
    await page.getByRole("menuitem", { name: "Perdido" }).click();
    const perda = page.getByRole("dialog", { name: "Marcar como Perdido" });
    await perda.getByRole("button", { name: "Confirmar Perdido" }).click();
    await expect(perda.getByRole("alert")).toHaveText("Escolha o motivo da perda.");
    await perda.getByRole("radio", { name: "Prazo inadequado" }).check();
    await perda.getByRole("button", { name: "Confirmar Perdido" }).click();
    await expect(perda.getByRole("alert")).toHaveText("Este motivo pede a data para revisitar.");
    await perda.getByLabel(/^Revisitar em( \*| \(obrigatório\))$/).fill("2099-01-10");
    await perda.getByRole("button", { name: "Confirmar Perdido" }).click();
    await expect(card).toHaveCount(0, { timeout: MUTATION_TIMEOUT_MS });

    // Na Lista, com os perdidos, o negócio aparece com a situação.
    await page.getByRole("link", { name: "Lista" }).click();
    await expect(page).toHaveURL(/visao=lista/);
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
    await page.getByLabel("Situação").selectOption("lost");
    const linha = page.getByRole("row").filter({ hasText: titulo });
    await expect(linha.getByText("Perdido", { exact: true })).toBeVisible();

    // A etapa Proposta tem o negócio: excluir pede o destino.
    await page.getByRole("button", { name: "Configurar pipelines" }).click();
    const config = page.getByRole("dialog", { name: "Configurar pipelines" });
    await config.getByRole("tab", { name: /Etapas/ }).click();
    await config.getByRole("button", { name: "Excluir Proposta" }).click();
    const exclusao = config.getByRole("group", { name: "Excluir Proposta" });
    await exclusao.getByLabel("Etapa de destino").selectOption({ label: "Negociação" });
    await exclusao.getByRole("button", { name: "Excluir e mover" }).click();
    await config.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(config.getByRole("status").filter({ hasText: "Alterações salvas." })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
    await config.getByRole("button", { name: "Arquivar" }).click();
    await expect(config.getByText("Arquivado", { exact: true })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
  });

  test("Calendário organiza previsões e negócios sem data, preservando a navegação e os filtros (PLU-277)", async ({ page }) => {
    const marca = Date.now();
    const pipeline = `Calendário E2E ${marca}`;
    const nomeCliente = `Cliente Calendário E2E ${marca}`;
    const semData = `Sem previsão E2E ${marca}`;
    const comData = `Fechamento E2E ${marca}`;
    const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const previsao = `${hoje.slice(0, 7)}-15`;
    await criarPipeline(page, pipeline);
    const pipelineId = await seletorDePipeline(page).inputValue();
    await page.getByRole("link", { name: "Calendário", exact: true }).click();
    await expect(page).toHaveURL(/visao=calendario/);
    await expect(page.getByRole("button", { name: "Filtros", exact: true })).toHaveAttribute("aria-expanded", "false");

    const outroPipeline = `Calendário alternativo E2E ${marca}`;
    await page.getByRole("button", { name: "Configurar pipelines" }).click();
    const configuracao = page.getByRole("dialog", { name: "Configurar pipelines" });
    await configuracao.getByRole("button", { name: "Novo pipeline" }).click();
    await configuracao.getByLabel(/^Nome do pipeline( \*| \(obrigatório\))$/).fill(outroPipeline);
    await configuracao.getByRole("radio", { name: /^Plugga/ }).check();
    await configuracao.getByRole("button", { name: "Criar pipeline" }).click();
    await expect(configuracao.getByRole("status").filter({ hasText: "Alterações salvas." })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
    await configuracao.getByRole("button", { name: "Fechar" }).click();
    const seletorPipeline = seletorDePipeline(page);
    const outroPipelineId = await seletorPipeline.getByRole("option", { name: new RegExp(outroPipeline) }).getAttribute("value");
    expect(outroPipelineId).not.toBeNull();
    await seletorPipeline.selectOption(outroPipelineId!);
    await expect(page).toHaveURL(new RegExp(`pipeline=${outroPipelineId}.*visao=calendario`));
    await expect(page.getByRole("link", { name: "Calendário", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("region", { name: "Calendário de fechamentos" })).toBeVisible();
    await seletorPipeline.selectOption(pipelineId);
    await expect(page).toHaveURL(new RegExp(`pipeline=${pipelineId}.*visao=calendario`));
    await expect(page.getByRole("link", { name: "Calendário", exact: true })).toHaveAttribute("aria-current", "page");

    for (const titulo of [semData, comData]) {
      await page.getByRole("button", { name: "Novo negócio", exact: true }).click();
      const novo = page.getByRole("dialog", { name: "Novo negócio" });
      if (titulo === semData) {
        await novo.getByRole("button", { name: "+ Novo cliente" }).click();
        const cliente = page.getByRole("dialog", { name: "Novo cliente" });
        await cliente.getByLabel(/^Nome( \*| \(obrigatório\))$/).fill(nomeCliente);
        await cliente.getByLabel("Telefone", { exact: true }).fill("(92) 99999-0004");
        await cliente.getByRole("button", { name: "Cadastrar cliente" }).click();
      } else {
        await novo.getByLabel(/^Cliente( \*| \(obrigatório\))$/).fill(nomeCliente);
        await novo.getByRole("option", { name: new RegExp(nomeCliente) }).getByRole("button").click();
        await novo.getByLabel("Previsão de fechamento").fill(previsao);
      }
      await expect(novo.getByText(nomeCliente, { exact: true })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
      await novo.getByLabel(/^Título( \*| \(obrigatório\))$/).fill(titulo);
      await novo.getByLabel("Valor").fill("10.000,00");
      await novo.getByRole("button", { name: "Criar negócio" }).click();
      await expect(page.getByRole("article", { name: `Negócio ${titulo}` })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
    }

    const calendario = page.getByRole("region", { name: "Calendário de fechamentos" });
    const semPrevisao = page.getByRole("region", { name: "Negócios sem previsão" });
    const previsto = page.getByRole("article", { name: `Negócio ${comData}` });
    await expect(semPrevisao.getByRole("article", { name: `Negócio ${semData}` })).toBeVisible();
    await expect(semPrevisao.getByRole("article", { name: `Negócio ${comData}` })).toHaveCount(0);
    await expect(calendario.locator("section").filter({ has: page.locator(`time[datetime="${previsao}"]`) }).getByRole("article", { name: `Negócio ${comData}` })).toBeVisible();
    await page.getByRole("button", { name: "Próximo mês" }).click();
    await expect(previsto).toHaveCount(0);
    await expect(calendario.getByRole("status")).toHaveText("Nenhum fechamento previsto neste mês com estes filtros.");
    await expect(semPrevisao.getByRole("article")).toHaveCount(1);
    await page.getByRole("button", { name: "Mês anterior" }).click();
    await expect(previsto).toBeVisible();
    await page.getByRole("button", { name: "Próximo mês" }).click();
    await page.getByRole("button", { name: "Hoje", exact: true }).click();
    await expect(previsto).toBeVisible();

    const abrirFiltros = page.getByRole("button", { name: "Filtros", exact: true });
    await abrirFiltros.focus();
    await abrirFiltros.press("Enter");
    await page.getByLabel("Previsão de fechamento").selectOption("sem-previsao");
    await expect(previsto).toHaveCount(0);
    await page.getByRole("button", { name: "Filtros 1", exact: true }).click();
    await expect(page.getByRole("group", { name: "Filtros dos negócios" })).toBeHidden();
    await page.getByRole("link", { name: "Lista", exact: true }).click();
    await expect(page.getByRole("row").filter({ hasText: semData })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: comData })).toHaveCount(0);
    await page.getByRole("link", { name: "Calendário", exact: true }).click();
    await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
    await expect(previsto).toBeVisible();

    await page.reload();
    await expect(page.getByRole("link", { name: "Calendário", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(seletorDePipeline(page)).toHaveValue(pipelineId);
    await expect(previsto).toBeVisible();
    await previsto.getByRole("button", { name: `Ações de ${comData}` }).click();
    const moverParaQualificacao = page.waitForResponse((response) =>
      new URL(response.url()).pathname.match(/^\/api\/negocios\/[^/]+\/etapa$/) !== null
      && response.request().method() === "POST"
      && response.status() === 200,
    );
    await page.getByRole("menuitem", { name: "Qualificação", exact: true }).click();
    await moverParaQualificacao;
    await page.reload();
    await expect(page.getByRole("link", { name: "Calendário", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("article", { name: `Negócio ${comData}` })).toBeVisible();
    await page.getByRole("link", { name: "Kanban", exact: true }).click();
    await expect(page.getByRole("region", { name: "Qualificação", exact: true }).getByRole("article", { name: `Negócio ${comData}` })).toBeVisible();

    await page.getByRole("button", { name: "Configurar pipelines" }).click();
    const config = page.getByRole("dialog", { name: "Configurar pipelines" });
    await config.getByRole("button", { name: "Arquivar", exact: true }).click();
    await expect(config.getByText("Arquivado", { exact: true })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
    await config.getByRole("button", { name: "Fechar" }).click();
    await seletorDePipeline(page).selectOption(outroPipelineId!);
    await expect(page.getByRole("region", { name: `Negócios do pipeline ${outroPipeline}`, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Configurar pipelines" }).click();
    const configOutro = page.getByRole("dialog", { name: "Configurar pipelines" });
    await configOutro.getByRole("button", { name: "Arquivar", exact: true }).click();
    await expect(configOutro.getByText("Arquivado", { exact: true })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
  });
});
