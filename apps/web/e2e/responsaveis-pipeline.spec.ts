import { expect, test } from "@playwright/test";
import type { ListPipelinesResponse } from "@plugga/shared";

test("seletor mostra os responsáveis elegíveis do CRM mesmo sem equipe no funil", async ({ page, request, baseURL }, testInfo) => {
  const api = new URL(baseURL!);
  expect(["localhost", "127.0.0.1"]).toContain(api.hostname);
  api.port = String(Number(api.port) + 1);
  const resposta = await request.get(`${api.origin}/pipelines`);
  expect(resposta.ok()).toBe(true);
  const { pipelines, responsaveis } = await resposta.json() as ListPipelinesResponse;
  const ativos = pipelines.filter((p) => !p.archivedAt);
  expect(ativos.length).toBeGreaterThan(0);
  expect(responsaveis.length).toBeGreaterThan(0);
  const pipeline = ativos.find((p) => p.members.length === 0) ?? ativos[0]!;
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  await page.getByRole("button", { name: "Novo lead", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Novo negócio" });
  await dialogo.locator("#negocio-responsavel").click();
  const opcoes = page.getByRole("option");
  await expect(opcoes).toHaveCount(responsaveis.length);
  for (const pessoa of responsaveis) {
    await expect(opcoes.filter({ hasText: pessoa.email! })).toContainText(pessoa.name);
  }
  await page.screenshot({ path: testInfo.outputPath("responsaveis-crm.png"), fullPage: true });
  await opcoes.filter({ hasText: responsaveis[0]!.email! }).click();
  await expect(dialogo.locator("#negocio-responsavel")).toContainText(responsaveis[0]!.name);
});
