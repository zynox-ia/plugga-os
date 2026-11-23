import { expect, test } from "@playwright/test";

import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * Visão geral e Configurações da Engenharia (PLU-349): os metric cards abrem as
 * O.S. filtradas; o prazo padrão de um tipo muda nas Configurações e pré-preenche
 * a Nova O.S. O teste devolve o prazo ao padrão no fim (o teardown não apaga configuração).
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.216" }, contextOptions: { reducedMotion: "reduce" } });
const DEPOIS_DA_ACAO = { timeout: 15_000 };

test("Visão geral: cards abrem as O.S. filtradas; Configurações mudam o prazo sugerido da Nova O.S.", async ({ page, request, baseURL }) => {
  test.slow();
  await bloquearTerceiros(page);
  await page.goto("/engenharia/visao-geral");
  await expect(page.getByRole("heading", { name: "Visão geral", level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Campo hoje" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Tarefas de hoje" })).toBeVisible();

  // O card Atrasadas abre as O.S. com o filtro de atenção.
  await page.getByRole("button", { name: /^Atrasadas/ }).click();
  await expect(page).toHaveURL(/\/engenharia\/ordens-de-servico\?situacao=atrasadas/, DEPOIS_DA_ACAO);

  // Configurações: Limpeza passa a ter 5 dias úteis.
  await page.goto("/engenharia/visao-geral");
  await page.getByRole("button", { name: "Configurações da Engenharia" }).click();
  const cfg = page.getByRole("dialog", { name: "Configurações da Engenharia" });
  await cfg.getByRole("button", { name: "Editar Limpeza" }).click(DEPOIS_DA_ACAO);
  const editar = page.getByRole("dialog", { name: "Editar Limpeza" });
  const prazo = editar.getByLabel(/^Prazo padrão/);
  const original = await prazo.inputValue();
  try {
    await prazo.fill("31");
    await editar.getByRole("button", { name: "Salvar" }).click();
    await expect(editar.getByText("Erro: use um número de 0 a 30.")).toBeVisible();
    await prazo.fill("5");
    await editar.getByRole("button", { name: "Salvar" }).click();
    await expect(cfg.getByText("Limpeza atualizado.")).toBeVisible(DEPOIS_DA_ACAO);
    await expect(cfg.getByRole("row", { name: /Limpeza/ })).toContainText("5 dias úteis");
    await cfg.getByRole("button", { name: "Fechar", exact: true }).first().click();

    // Nova O.S.: escolher Limpeza traz o prazo sugerido (5 dias úteis a partir de hoje).
    const opcoes = (await (await request.get("/api/engenharia/ordens-de-servico/opcoes")).json()) as { prazoSugerido: Record<string, string> };
    const esperado = opcoes.prazoSugerido.limpeza!.split("-").reverse().join("/");
    await page.goto("/engenharia/ordens-de-servico");
    await page.getByRole("button", { name: "Nova O.S." }).first().click();
    const nova = page.getByRole("dialog", { name: "Nova O.S." });
    await nova.getByRole("combobox", { name: /^Tipo/ }).click();
    await page.getByRole("option", { name: "Limpeza" }).click();
    await expect(nova.getByRole("textbox", { name: /^Prazo/ })).toHaveValue(esperado);
  } finally {
    // Devolve o prazo de antes, pela API (a configuração não leva a marca da execução).
    await request.put("/api/engenharia/configuracoes/tipos/limpeza", { headers: { origin: baseURL! }, data: { prazoPadraoDiasUteis: Number(original), agendadorId: null } });
  }
});
