import { expect, test } from "@playwright/test";

const MUTATION_TIMEOUT_MS = 15_000;

test.describe("Pipelines — configuração pelo modal (PLU-269)", () => {
  test("o gestor cria um pipeline, que vira aba com as etapas, e o arquiva", async ({ page }) => {
    const nome = `Pipeline E2E ${Date.now()}`;
    await page.goto("/comercial/pipelines");
    await page.getByRole("button", { name: "Configurar pipelines" }).click();
    const modal = page.getByRole("dialog", { name: "Configurar pipelines" });

    await modal.getByRole("button", { name: "+ Novo pipeline" }).click();
    await modal.getByLabel("Nome do pipeline *").fill(nome);
    await modal.getByLabel("Plugga", { exact: true }).check();
    await modal.getByRole("tab", { name: "Etapas" }).click();
    await modal.getByRole("button", { name: "+ Adicionar etapa" }).click();
    await modal.getByLabel("Nome da etapa 5").fill("Contrato");
    await modal.getByLabel("Nome do Ganho neste pipeline *").fill("Contrato assinado");
    await modal.getByRole("button", { name: "Criar pipeline" }).click();
    await expect(modal.getByRole("status").filter({ hasText: "Alterações salvas." })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });

    await modal.getByRole("button", { name: "Fechar" }).click();
    await page.getByRole("navigation", { name: "Pipelines" }).getByRole("link", { name: new RegExp(nome) }).click();
    const quadro = page.getByRole("region", { name: `Quadro do pipeline ${nome}` });
    await expect(quadro.getByRole("heading", { level: 3 })).toHaveText(["Iniciar atendimento", "Qualificação", "Proposta", "Negociação", "Contrato"]);
    await expect(quadro.getByText("✓ Contrato assinado")).toBeVisible();

    // O link da aba reabre o mesmo pipeline para quem o recebe.
    await page.goto(page.url());
    await expect(page.getByRole("region", { name: `Quadro do pipeline ${nome}` })).toBeVisible();

    await page.getByRole("button", { name: "Configurar pipelines" }).click();
    await modal.getByRole("button", { name: "Arquivar" }).click();
    await expect(modal.getByText("Arquivado.", { exact: false })).toBeVisible({ timeout: MUTATION_TIMEOUT_MS });
    await modal.getByRole("button", { name: "Fechar" }).click();
    await expect(page.getByRole("navigation", { name: "Pipelines" }).getByRole("link", { name: new RegExp(nome) })).toHaveCount(0);
  });
});
