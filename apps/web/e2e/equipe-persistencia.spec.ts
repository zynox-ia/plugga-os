import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { ListaDaEquipe } from "@plugga/shared";

test("persiste telas e confirma desativação e remoção pela interface existente", async ({ page, request, baseURL }, testInfo) => {
  test.setTimeout(90_000);
  page.setDefaultTimeout(10_000);
  // Este teste cria apenas uma identidade sintética, com envio de e-mail desligado.
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  const apiLocal = new URL(baseURL!);
  apiLocal.port = String(Number(apiLocal.port) + 1);
  const apiURL = process.env.E2E_API_URL ?? apiLocal.origin;
  expect(["localhost", "127.0.0.1"]).toContain(new URL(apiURL).hostname);
  const emailStatus = await request.get(`${apiURL}/email/status`);
  expect(emailStatus.ok()).toBe(true);
  expect(await emailStatus.json()).toMatchObject({ provider: "noop" });
  const email = `equipe-e2e-${randomUUID()}@teste.local`;
  const membros = async () => {
    const response = await request.get("/api/equipe");
    expect(response.ok()).toBe(true);
    return (await response.json() as ListaDaEquipe).membros;
  };
  const membro = async () => (await membros()).find((item) => item.email === email);
  const abrir = async () => {
    await page.goto("/configuracoes");
    await page.getByRole("tab", { name: "Equipe e Acessos" }).click();
    await page.getByRole("searchbox", { name: "Filtrar pessoas da equipe" }).fill(email);
  };
  const menu = async (acao: string) => {
    await page.locator("tbody tr", { hasText: email }).getByRole("button", { name: /Mais ações/ }).click();
    await page.getByRole("menuitem", { name: acao, exact: true }).click();
  };
  try {
    await abrir();
    await page.getByRole("button", { name: "Novo Membro" }).click();
    let dialogo = page.getByRole("dialog", { name: "Novo Membro" });
    await dialogo.getByLabel("Nome completo").fill("Pessoa sintética E2E");
    await dialogo.getByLabel("E-mail corporativo").fill(email);
    await dialogo.getByRole("checkbox", { name: "CRM", exact: true }).check();
    await dialogo.getByRole("button", { name: "Desmarcar todas", exact: true }).click();
    await dialogo.getByLabel("Pipelines", { exact: true }).check();
    await dialogo.getByRole("button", { name: "Enviar convite" }).click();
    await expect(dialogo).toHaveCount(0);
    await expect.poll(async () => (await membro())?.acesso.departamentos[0]?.telas).toEqual(["crm.pipelines"]);

    await abrir();
    await menu("Mudar acesso");
    dialogo = page.getByRole("dialog");
    await expect(dialogo.getByLabel("Pipelines", { exact: true })).toBeChecked();
    await expect(dialogo.getByLabel("Clientes", { exact: true })).not.toBeChecked();
    await dialogo.getByRole("button", { name: "Marcar todas", exact: true }).click();
    await expect(dialogo.getByText("4/4", { exact: true })).toBeVisible();
    await dialogo.getByRole("button", { name: "Desmarcar todas", exact: true }).click();
    await dialogo.getByLabel("Clientes", { exact: true }).check();
    await dialogo.getByRole("button", { name: "Salvar acesso" }).click();
    await expect(dialogo).toHaveCount(0);
    await expect.poll(async () => (await membro())?.acesso.departamentos[0]?.telas).toEqual(["crm.clientes"]);
    await abrir();
    await menu("Enviar link de acesso");
    await expect(page.getByText("Convite reenviado.", { exact: true })).toBeVisible();
    await menu("Desativar acesso");
    dialogo = page.getByRole("dialog", { name: "Desativar Acesso", exact: true });
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    expect((await membro())?.status).toBe("invited");
    await menu("Desativar acesso");
    await dialogo.getByRole("button", { name: "Desativar Acesso", exact: true }).click();
    await expect(dialogo).toHaveCount(0);
    await expect.poll(async () => (await membro())?.status).toBe("disabled");
    await abrir();
    await menu("Remover membro");
    dialogo = page.getByRole("dialog", { name: "Remover Membro", exact: true });
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    expect(await membro()).toBeDefined();
    await menu("Remover membro");
    await dialogo.getByRole("button", { name: "Remover Membro", exact: true }).click();
    await expect(dialogo).toHaveCount(0);
    await expect.poll(membro).toBeUndefined();
    await abrir();
    await expect(page.locator("tbody tr", { hasText: email }).getByRole("button", { name: /Ver detalhes/ })).toHaveCount(0);
    await page.getByRole("searchbox", { name: "Filtrar pessoas da equipe" }).fill("");
    await page.screenshot({ path: testInfo.outputPath("equipe-depois.png"), fullPage: true });
  } finally {
    const criado = await membro();
    if (criado) {
      const response = await request.post(`/api/equipe/${criado.id}/remover`, { headers: { origin: baseURL! }, data: {} });
      expect(response.ok()).toBe(true);
    }
  }
});
