import { expect, test, type Page } from "@playwright/test";

const MUTATION_TIMEOUT_MS = 15_000;

/**
 * Cria um pipeline com toda a equipe comercial disponível. Na CI, as contas de
 * exemplo do seed (SEED_SAMPLE_TEAM) dão alguém com papel comercial na Plugga.
 */
async function criarPipelineComEquipe(page: Page, nome: string): Promise<void> {
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
  await modal.getByLabel("Nome do pipeline *").fill(nome);

  const incluirTodos = modal.getByRole("button", { name: "Incluir todos como vendedores" });
  for (const empresa of [/^Plugga/, /^Waze Energia/]) {
    await modal.getByRole("tab", { name: "Geral" }).click();
    await modal.getByRole("radio", { name: empresa }).check();
    await modal.getByRole("tab", { name: /Equipe/ }).click();
    await expect(modal.getByText("Carregando pessoas…")).toHaveCount(0);
    if (await incluirTodos.isVisible()) break;
  }
  await expect(incluirTodos, "o e2e precisa de alguém com papel comercial (SEED_SAMPLE_TEAM=true)").toBeVisible();
  await incluirTodos.click();
  await modal.getByRole("button", { name: "Criar pipeline" }).click();
  await expect(modal.getByRole("status").filter({ hasText: "Alterações salvas." })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
  await modal.getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("navigation", { name: "Pipelines" }).getByRole("link", { name: new RegExp(nome) }).click();
  await expect(page.getByRole("region", { name: `Negócios do pipeline ${nome}` })).toBeVisible();
}

test.describe("Negócios no quadro do pipeline (PLU-271)", () => {
  test("cria negócio com cliente novo, muda de etapa, perde com revisita e só exclui a etapa com destino", async ({ page }) => {
    const marca = Date.now();
    const pipeline = `Negócios E2E ${marca}`;
    const titulo = `Hotel E2E ${marca} — usina 120 kWp`;
    await criarPipelineComEquipe(page, pipeline);

    // Novo negócio já na coluna Qualificação, cadastrando o cliente sem sair.
    await page.getByRole("button", { name: "Novo negócio em Qualificação" }).click();
    const novo = page.getByRole("dialog", { name: "Novo negócio" });
    await expect(novo.getByLabel("Etapa inicial *")).toHaveValue(/.+/);
    await novo.getByRole("button", { name: "+ Novo cliente" }).click();
    const cliente = page.getByRole("dialog", { name: "Novo cliente" });
    await cliente.getByLabel("Nome *").fill(`Hotel Mirante E2E ${marca}`);
    await cliente.getByLabel("Telefone", { exact: true }).fill("(92) 99999-0003");
    await cliente.getByRole("button", { name: "Cadastrar cliente" }).click();
    await expect(novo.getByText(`Hotel Mirante E2E ${marca}`)).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
    await novo.getByLabel("Título *").fill(titulo);
    await novo.getByLabel("Valor").fill("480.000,00");
    await novo.getByRole("button", { name: "Criar negócio" }).click();

    const card = page.getByRole("article", { name: `Negócio ${titulo}` });
    await expect(card).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
    await expect(page.getByRole("region", { name: "Qualificação" }).getByRole("article", { name: `Negócio ${titulo}` })).toBeVisible();
    await expect(card.getByText("R$ 480 mil")).toBeVisible();

    // Muda de etapa pelo menu do card (a alternativa ao arrastar) e continua lá depois de recarregar.
    await card.getByRole("button", { name: `Ações de ${titulo}` }).click();
    await page.getByRole("menuitem", { name: "Proposta" }).click();
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
    await perda.getByLabel("Revisitar em *").fill("2099-01-10");
    await perda.getByRole("button", { name: "Confirmar Perdido" }).click();
    await expect(card).toHaveCount(0, { timeout: MUTATION_TIMEOUT_MS });

    // Na Lista, com os perdidos, o negócio aparece com a situação.
    await page.getByRole("link", { name: "Lista" }).click();
    await expect(page).toHaveURL(/visao=lista/);
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
});
