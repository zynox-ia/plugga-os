import { expect, test } from "@playwright/test";
import type { CreateClientResponse } from "@plugga/shared";

import { marcaDaExecucao } from "./support/execucao";
import { bloquearTerceiros } from "./support/sem-terceiros";

/** Agenda de campo (PLU-346): a O.S. sem data fica em "Para agendar"; agendada, vai para a semana do técnico. */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.218" }, contextOptions: { reducedMotion: "reduce" } });
const DEPOIS_DA_ACAO = { timeout: 15_000 };
const literal = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("agendar pela Agenda: sai de Para agendar e entra na grade da semana", async ({ page, request, baseURL }) => {
  test.slow();
  await bloquearTerceiros(page);
  const H = { origin: baseURL! };
  const sufixo = Date.now().toString(36).toUpperCase();
  const { client } = (await (await request.post("/api/clientes", { headers: H, data: { personType: "pj", name: `Cliente agenda ${sufixo} (sintético)`, email: `agenda-${sufixo.toLowerCase()}@teste.local` } })).json()) as CreateClientResponse;
  // A data do agendamento é o próximo dia útil: com hoje numa sexta, cai na segunda, e a semana mostrada é a dele.
  const manaus = (dias: number) => new Date(Date.now() - 4 * 3_600_000 + dias * 86_400_000);
  let n = 1; while ([0, 6].includes(manaus(n).getUTCDay())) n += 1;
  const dia = manaus(n).toISOString().slice(0, 10);
  // Prazo de hoje: "Para agendar" corta em 100 pelo prazo, e a O.S. do teste precisa estar entre as primeiras.
  const criada = await request.post("/api/engenharia/ordens-de-servico", { headers: H, data: { empresa: "waze", tipo: "visita_tecnica", clienteId: client.id, descricao: `Visita ${marcaDaExecucao()} ${sufixo} (sintético)`, prazo: manaus(0).toISOString().slice(0, 10) } });
  expect(criada.ok(), await criada.text()).toBeTruthy();
  const { codigo } = (await criada.json()) as { codigo: string };

  await page.goto(`/engenharia/agenda?semana=${dia}`);
  const paraAgendar = page.getByRole("region", { name: "Para agendar" });
  await expect(paraAgendar.getByText(`Cliente agenda ${sufixo} (sintético) · Visita técnica`)).toBeVisible(DEPOIS_DA_ACAO);
  await paraAgendar.getByRole("button", { name: `Agendar ${codigo}` }).click();
  const agendar = page.getByRole("dialog", { name: `Agendar ${codigo}` });
  await agendar.getByRole("button", { name: "Agendar" }).click();
  await expect(agendar.getByText("Erro: escolha o técnico.")).toBeVisible();
  await agendar.getByRole("combobox", { name: /^Técnico/ }).click();
  await page.getByRole("option").first().click();
  await agendar.getByRole("textbox", { name: /^Data/ }).fill(dia.split("-").reverse().join("/"));
  await agendar.getByRole("button", { name: "Agendar" }).click();
  await expect(page.locator(".aviso--sucesso")).toContainText(`${codigo} agendada.`, DEPOIS_DA_ACAO);

  // Sai de Para agendar e aparece na grade, no dia, às 08:00; o bloco abre a ficha nas O.S.
  await expect(paraAgendar.getByText(`Cliente agenda ${sufixo} (sintético)`)).toHaveCount(0, DEPOIS_DA_ACAO);
  const bloco = page.getByRole("table").getByRole("link", { name: new RegExp(`^${codigo}: ${literal(`Cliente agenda ${sufixo} (sintético)`)}, 08:00`) });
  await expect(bloco).toBeVisible();
  await bloco.click();
  await expect(page).toHaveURL(/\/engenharia\/ordens-de-servico\?os=/, DEPOIS_DA_ACAO);
});
