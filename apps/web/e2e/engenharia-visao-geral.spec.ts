import { expect, test } from "@playwright/test";
import { PRAZO_PADRAO_DO_TIPO, type ConfiguracoesDaEngenharia } from "@plugga/shared";

import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * Visão geral e Configurações da Engenharia (PLU-349): os metric cards abrem as
 * O.S. filtradas; o prazo padrão de um tipo muda nas Configurações e pré-preenche
 * a Nova O.S. O teste usa o tipo Outros (o menos usado) e devolve o prazo e quem agenda
 * no fim; a configuração não leva a marca da execução, então o teardown não a restaura.
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

  // O que está configurado para Outros agora, para devolver no fim (se a leitura falhar, vale o padrão do contrato).
  const antes = await request.get("/api/engenharia/configuracoes");
  const atual = antes.ok() ? ((await antes.json()) as ConfiguracoesDaEngenharia).tipos.find((t) => t.tipo === "outros") : undefined;
  const devolver = { prazoPadraoDiasUteis: atual?.prazoPadraoDiasUteis ?? PRAZO_PADRAO_DO_TIPO.outros, agendadorId: atual?.agendador?.id ?? null };
  // Um 5 lido aqui seria o que este teste grava: só pode ser sobra de uma corrida interrompida.
  if (devolver.prazoPadraoDiasUteis === 5) devolver.prazoPadraoDiasUteis = PRAZO_PADRAO_DO_TIPO.outros;

  // Configurações: Outros passa a ter 5 dias úteis.
  await page.goto("/engenharia/visao-geral");
  await page.getByRole("button", { name: "Configurações da Engenharia" }).click();
  const cfg = page.getByRole("dialog", { name: "Configurações da Engenharia" });
  await cfg.getByRole("button", { name: "Editar Outros" }).click(DEPOIS_DA_ACAO);
  const editar = page.getByRole("dialog", { name: "Editar Outros" });
  const prazo = editar.getByLabel(/^Prazo padrão/);
  try {
    await prazo.fill("31");
    await editar.getByRole("button", { name: "Salvar" }).click();
    await expect(editar.getByText("Erro: use um número de 0 a 30.")).toBeVisible();
    await prazo.fill("5");
    await editar.getByRole("button", { name: "Salvar" }).click();
    await expect(cfg.getByText("Outros atualizado.")).toBeVisible(DEPOIS_DA_ACAO);
    await expect(cfg.getByRole("row", { name: /Outros/ })).toContainText("5 dias úteis");
    await cfg.getByRole("button", { name: "Fechar", exact: true }).first().click();

    // Nova O.S.: escolher Outros traz o prazo sugerido (5 dias úteis a partir de hoje).
    const opcoes = (await (await request.get("/api/engenharia/ordens-de-servico/opcoes")).json()) as { prazoSugerido: Record<string, string> };
    const esperado = opcoes.prazoSugerido.outros!.split("-").reverse().join("/");
    await page.goto("/engenharia/ordens-de-servico");
    await page.getByRole("button", { name: "Nova O.S." }).first().click();
    const nova = page.getByRole("dialog", { name: "Nova O.S." });
    await nova.getByRole("combobox", { name: /^Tipo/ }).click();
    await page.getByRole("option", { name: "Outros" }).click();
    await expect(nova.getByRole("textbox", { name: /^Prazo/ })).toHaveValue(esperado);
  } finally {
    // Devolve o prazo e quem agenda de antes; conferido, para uma falha aqui não passar calada.
    const volta = await request.put("/api/engenharia/configuracoes/tipos/outros", { headers: { origin: baseURL! }, data: devolver });
    expect(volta.ok(), "a configuração de Outros não voltou ao que era").toBeTruthy();
  }
});
