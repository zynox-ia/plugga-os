import { expect, test } from "@playwright/test";
import type { ListPipelinesResponse } from "@plugga/shared";

import { marcaDaExecucao } from "./support/execucao";
import { criarPipelineProprio } from "./support/pipeline-proprio";

test("seletor mostra os responsáveis elegíveis do CRM mesmo sem equipe no funil", async ({ page, request, baseURL }, testInfo) => {
  const api = new URL(baseURL!);
  expect(["localhost", "127.0.0.1"]).toContain(api.hostname);
  // Um funil próprio, sem equipe: não depende de outro spec deixar um pipeline ativo.
  const { pipeline, arquivar } = await criarPipelineProprio(request, baseURL!, `Responsáveis ${marcaDaExecucao()}`);
  try {
  api.port = String(Number(api.port) + 1);
  const resposta = await request.get(`${api.origin}/pipelines`);
  expect(resposta.ok()).toBe(true);
  const { pipelines, responsaveis } = await resposta.json() as ListPipelinesResponse;
  expect(pipelines.find((p) => p.id === pipeline.id)?.members).toEqual([]);
  expect(responsaveis.length).toBeGreaterThan(0);
  await page.goto(`/comercial/pipelines?pipeline=${pipeline.id}`);
  await page.getByRole("button", { name: "Novo lead", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Novo lead", exact: true });
  await dialogo.locator("#lead-responsavel").click();
  const opcoes = page.getByRole("option");
  await expect(opcoes).toHaveCount(responsaveis.length);
  for (const [indice, pessoa] of responsaveis.entries()) {
    expect(pessoa).not.toHaveProperty("email");
    await expect(opcoes.nth(indice).locator(".ui-member-name")).toHaveText(pessoa.name);
  }
  await page.screenshot({ path: testInfo.outputPath("responsaveis-crm.png"), fullPage: true });
  await opcoes.first().click();
  await expect(dialogo.locator("#lead-responsavel")).toContainText(responsaveis[0]!.name);
  } finally {
    await arquivar();
  }
});
