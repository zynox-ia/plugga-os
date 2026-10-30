import { expect, test } from "@playwright/test";
import { pipelineParaEdicao, type Pipeline } from "@plugga/shared";

test("configuração valida as abas e persiste criação e edição após recarregar", async ({ page }) => {
  test.setTimeout(90_000);
  const nome = `Configuração E2E ${Date.now()}`;
  const modal = page.getByRole("dialog", { name: "Configurar pipelines" });
  let pipeline: Pipeline | undefined;

  const salvar = async (criando = false) => {
    const resposta = page.waitForResponse((r) => r.url().includes("/api/pipelines") && r.request().method() === (criando ? "POST" : "PUT"));
    await modal.getByRole("button", { name: criando ? "Criar pipeline" : "Salvar alterações", exact: true }).click();
    return resposta;
  };
  const reabrir = async () => {
    await modal.getByRole("button", { name: "Fechar diálogo" }).click();
    await page.goto(`/comercial/pipelines?pipeline=${pipeline!.id}`);
    await page.getByRole("button", { name: "Configurar pipelines", exact: true }).click();
    await expect(modal.getByLabel("Nome do pipeline", { exact: false })).toHaveValue(pipeline!.name);
  };

  try {
    await page.goto("/comercial/pipelines");
    const primeiro = page.getByRole("button", { name: "Criar pipeline", exact: true });
    if (await primeiro.isVisible()) await primeiro.click();
    else {
      await page.getByRole("button", { name: "Configurar pipelines", exact: true }).click();
      await modal.getByRole("button", { name: "Novo pipeline" }).click();
    }

    expect((await salvar(true)).status()).toBe(400);
    await expect(modal.getByLabel("Nome do pipeline", { exact: false })).toHaveAttribute("aria-invalid", "true");
    await modal.getByLabel("Nome do pipeline", { exact: false }).fill(nome);
    await modal.getByLabel("Nome do campo de valor", { exact: false }).fill("");
    expect((await salvar(true)).status()).toBe(400);
    await expect(modal.getByLabel("Nome do campo de valor", { exact: false })).toHaveAttribute("aria-invalid", "true");
    await modal.getByLabel("Nome do campo de valor", { exact: false }).fill("Receita prevista");
    await modal.getByLabel("Descrição", { exact: true }).fill("Dados sintéticos para validar persistência.");
    await modal.getByRole("radiogroup", { name: "Cor do pipeline" }).getByRole("radio", { name: "Violeta", exact: true }).click();

    await modal.getByRole("tab", { name: "Etapas", exact: true }).click();
    await modal.getByLabel("Nome da etapa 1", { exact: true }).fill("Triagem");
    await modal.getByLabel("Nome da etapa 2", { exact: true }).fill("Triagem");
    expect((await salvar(true)).status()).toBe(400);
    await expect(modal.getByRole("alert").filter({ hasText: "já existe uma etapa" })).toBeVisible();
    await modal.getByLabel("Nome da etapa 2", { exact: true }).fill("Proposta auditada");
    await modal.getByLabel("Dias para alertar parado em Triagem", { exact: true }).fill("366");
    expect((await salvar(true)).status()).toBe(400);
    await modal.getByLabel("Dias para alertar parado em Triagem", { exact: true }).fill("9");
    await modal.getByRole("button", { name: "Descer Triagem", exact: true }).click();

    await modal.getByRole("tab", { name: "Etiquetas", exact: true }).click();
    await modal.getByRole("button", { name: "Nova etiqueta" }).click();
    await modal.getByLabel("Nome da etiqueta 1", { exact: true }).fill("Auditoria");
    await modal.getByRole("button", { name: "Nova etiqueta" }).click();
    await modal.getByLabel("Nome da etiqueta 2", { exact: true }).fill("auditoria");
    expect((await salvar(true)).status()).toBe(400);
    await expect(modal.getByRole("alert").filter({ hasText: "já existe uma etiqueta" })).toBeVisible();
    await modal.getByLabel("Nome da etiqueta 2", { exact: true }).fill("Revisar");

    await expect(modal.getByRole("tab", { name: "Equipe", exact: true })).toHaveCount(0);
    const criada = await salvar(true);
    expect(criada.status()).toBe(201);
    pipeline = await criada.json() as Pipeline;
    await expect(modal.getByRole("status")).toContainText("Alterações salvas.");
    await reabrir();

    await expect(modal.getByLabel("Nome do campo de valor", { exact: false })).toHaveValue("Receita prevista");
    await expect(modal.getByLabel("Descrição", { exact: true })).toHaveValue("Dados sintéticos para validar persistência.");
    await expect(modal.getByRole("radiogroup", { name: "Cor do pipeline" }).getByRole("radio", { name: "Violeta", exact: true })).toHaveAttribute("aria-checked", "true");
    await modal.getByRole("tab", { name: "Etapas", exact: true }).click();
    await expect(modal.getByLabel("Nome da etapa 1", { exact: true })).toHaveValue("Proposta auditada");
    await expect(modal.getByLabel("Dias para alertar parado em Triagem", { exact: true })).toHaveValue("9");
    await modal.getByRole("tab", { name: "Etiquetas", exact: true }).click();
    await expect(modal.getByLabel("Nome da etiqueta 1", { exact: true })).toHaveValue("Auditoria");
    await expect(modal.getByLabel("Nome da etiqueta 2", { exact: true })).toHaveValue("Revisar");
    await modal.getByLabel("Nome da etiqueta 1", { exact: true }).fill("Auditado");
    const versaoAnterior = pipelineParaEdicao(pipeline);
    const editada = await salvar();
    expect(editada.status()).toBe(200);
    pipeline = await editada.json() as Pipeline;
    await expect(modal.getByRole("status")).toContainText("Alterações salvas.");
    await reabrir();
    await modal.getByRole("tab", { name: "Etiquetas", exact: true }).click();
    await expect(modal.getByLabel("Nome da etiqueta 1", { exact: true })).toHaveValue("Auditado");
    await expect(modal.getByRole("tab", { name: "Equipe", exact: true })).toHaveCount(0);

    const headers = { origin: new URL(page.url()).origin };
    const conflito = await page.request.put(`/api/pipelines/${pipeline.id}`, { headers, data: versaoAnterior });
    expect(conflito.status()).toBe(409);
    const equipeInvalida = await page.request.put(`/api/pipelines/${pipeline.id}`, {
      headers,
      data: { ...pipelineParaEdicao(pipeline), members: [{ userId: "00000000-0000-4000-8000-000000000099", role: "gestor" }] },
    });
    expect(equipeInvalida.status()).toBe(400);

    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 700 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(() => modal.evaluate((dialogo) => {
        const botao = dialogo.querySelector('.config-rodape-acoes button:last-child')!;
        return dialogo.getBoundingClientRect().bottom - botao.getBoundingClientRect().bottom;
      })).toBeGreaterThanOrEqual(24);
    }
  } finally {
    if (pipeline) {
      const resposta = await page.request.post(`/api/pipelines/${pipeline.id}/arquivar`, { headers: { origin: new URL(page.url()).origin } });
      expect(resposta.ok()).toBe(true);
    }
  }
});
