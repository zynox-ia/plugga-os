import { expect, test, type Page } from "@playwright/test";

import { marcaDaExecucao } from "./support/execucao";
import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * Protocolos na distribuidora (PLU-348), no desktop: a distribuidora da execução pela
 * API (o e2e.admin é plataforma), o Novo protocolo pela tela com o "Cliente com UC
 * (exemplo)" do seed, e as verificações até encerrar. A marca da execução vai no
 * número do protocolo e no nome da distribuidora, que a limpeza apaga.
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.219" }, contextOptions: { reducedMotion: "reduce" } });
const DEPOIS_DA_ACAO = { timeout: 15_000 };
const CLIENTE = "Cliente com UC (exemplo)";
const literal = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const manaus = (dias: number) => new Date(Date.now() - 4 * 3_600_000 + dias * 86_400_000).toISOString().slice(0, 10);
const legivel = (dia: string) => dia.split("-").reverse().join("/");

async function escolher(page: Page, dialogo: ReturnType<Page["getByRole"]>, campo: RegExp, opcao: string | RegExp) {
  await dialogo.getByRole("combobox", { name: campo }).click();
  await page.getByRole("option", { name: opcao }).first().click();
}

test("novo protocolo pela tela; a pendência pede a ação; liberado encerra sem lembrete", async ({ page, request, baseURL }) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await bloquearTerceiros(page);
  const H = { origin: baseURL! };
  const sufixo = Date.now().toString(36).toUpperCase();
  const distribuidora = `${marcaDaExecucao()} Distribuidora ${sufixo} (sintética)`;
  const criada = await request.post("/api/protocolos/distribuidoras", { headers: H, data: { nome: distribuidora, uf: "AM" } });
  expect(criada.ok(), await criada.text()).toBeTruthy();
  const numero = `${marcaDaExecucao()} ${sufixo}`;

  // 1. Novo protocolo: obrigatórios, a data-limite e o cliente com a UC.
  await page.goto("/engenharia/protocolos?empresa=waze");
  await page.getByRole("button", { name: "Novo protocolo" }).first().click();
  const novo = page.getByRole("dialog", { name: "Novo protocolo" });
  await novo.getByRole("button", { name: "Registrar protocolo" }).click();
  await expect(novo.getByText("Erro: escolha o tipo.")).toBeVisible();
  await expect(novo.getByText("Erro: informe a data-limite.")).toBeVisible();
  const departamento = novo.getByRole("combobox", { name: /^Departamento/ });
  if (await departamento.count()) await escolher(page, novo, /^Departamento/, "Engenharia");
  await escolher(page, novo, /^Tipo/, "Liberação");
  await novo.getByRole("searchbox", { name: /Cliente/ }).fill("Cliente com UC");
  await novo.getByRole("button", { name: new RegExp(literal(CLIENTE)) }).click(DEPOIS_DA_ACAO);
  if (!(await novo.getByRole("combobox", { name: /^Unidade consumidora/ }).textContent())?.includes("UC")) await escolher(page, novo, /^Unidade consumidora/, /UC/);
  await escolher(page, novo, /^Distribuidora/, new RegExp(literal(distribuidora)));
  await novo.getByLabel(/^Número do protocolo/).fill(numero);
  await novo.getByRole("textbox", { name: /^Data-limite/ }).fill(legivel(manaus(10)));
  await novo.getByRole("textbox", { name: /^Primeira verificação/ }).fill(legivel(manaus(0)));
  await novo.getByRole("button", { name: "Registrar protocolo" }).click();
  await expect(page.locator(".aviso--sucesso")).toContainText(`Protocolo ${numero} registrado.`, DEPOIS_DA_ACAO);

  // 2. A ficha abre; verificar hoje. A pendência pede o que fazer.
  const ficha = page.getByRole("dialog", { name: new RegExp(`^Protocolo ${literal(numero)}:`) });
  await expect(ficha.getByText("Verificar hoje")).toBeVisible(DEPOIS_DA_ACAO);
  await escolher(page, ficha, /^Resultado/, "Pendência da distribuidora");
  await ficha.getByRole("button", { name: "Registrar verificação" }).click();
  await expect(ficha.getByText("Erro: diga o que precisa ser feito.")).toBeVisible();
  await ficha.getByLabel(/^O que precisa ser feito/).fill("Reenviar o diagrama unifilar (sintético)");
  await ficha.getByRole("textbox", { name: /^Próxima verificação/ }).fill(legivel(manaus(2)));
  await ficha.getByRole("button", { name: "Registrar verificação" }).click();
  await expect(ficha.getByText(`Verificação registrada. Próxima: ${legivel(manaus(2))}.`)).toBeVisible(DEPOIS_DA_ACAO);
  await expect(ficha.getByRole("region", { name: "Pendência da distribuidora" })).toContainText("Reenviar o diagrama unifilar (sintético)");

  // 3. Liberado encerra: sem próxima verificação, e o histórico guarda as duas.
  await escolher(page, ficha, /^Resultado/, "Liberado");
  await expect(ficha.getByRole("textbox", { name: /^Próxima verificação/ })).toHaveCount(0);
  await ficha.getByRole("button", { name: "Registrar verificação" }).click();
  await expect(ficha.getByText(`Protocolo ${numero} encerrado: liberado.`)).toBeVisible(DEPOIS_DA_ACAO);
  await expect(ficha.getByRole("button", { name: "Registrar verificação" })).toHaveCount(0);
  await ficha.getByRole("tab", { name: /^Verificações/ }).click();
  await expect(ficha.getByText("verificou: liberado")).toBeVisible();
  await expect(ficha.getByText("verificou: com pendência")).toBeVisible();

  // 4. No filtro de liberados, o card mostra a situação.
  await page.goto(`/engenharia/protocolos?situacao=liberado&busca=${encodeURIComponent(sufixo)}`);
  const card = page.getByRole("article", { name: new RegExp(`^Protocolo ${literal(numero)}:`) });
  await expect(card).toContainText("Liberado", DEPOIS_DA_ACAO);
  await expect(card).toContainText("encerrado");
});
