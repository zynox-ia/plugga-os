import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { marcaDaExecucao } from "./support/execucao";
import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * Usinas e monitoramento do dia (PLU-347), com dados sintéticos numa plataforma
 * própria da execução (a conferência pega todas as usinas ativas da plataforma e
 * empresa; com a plataforma do run, não colide com a conferência real do dia e
 * sai inteira na limpeza). Usa o "Cliente com UC (exemplo)" do seed.
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.217" }, contextOptions: { reducedMotion: "reduce" } });
const DEPOIS_DA_ACAO = { timeout: 15_000 };
const PNG = { name: "print-e2e.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqGeoBwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") };
const CLIENTE = "Cliente com UC (exemplo)";
const literal = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Plataforma da execução, criada pela API (o e2e.admin é plataforma). */
async function plataformaDoRun(request: APIRequestContext, baseURL: string, sufixo: string): Promise<{ id: string; nome: string }> {
  const nome = `E2E ${marcaDaExecucao().slice(4)} Plataforma ${sufixo}`;
  const r = await request.post("/api/engenharia/plataformas", { headers: { origin: baseURL }, data: { nome, observacaoDeAcesso: "No cofre (sintético)" } });
  expect(r.ok(), await r.text()).toBeTruthy();
  const { itens } = (await r.json()) as { itens: { id: string; nome: string }[] };
  return itens.find((p) => p.nome === nome)!;
}

async function escolher(page: Page, dialogo: ReturnType<Page["getByRole"]>, campo: RegExp, opcao: string | RegExp) {
  await dialogo.getByRole("combobox", { name: campo }).click();
  await page.getByRole("option", { name: opcao }).first().click();
}

/** dd/mm/aaaa de ontem em Manaus (o comissionamento não pode estar no futuro). */
const ontem = () => new Date(Date.now() - 4 * 3_600_000 - 86_400_000).toISOString().slice(0, 10).split("-").reverse().join("/");

test("cadastro: nova usina pela tela; conferir a plataforma com anomalia abre a O.S. do monitoramento", async ({ page, request, baseURL }) => {
  test.slow();
  await bloquearTerceiros(page);
  const sufixo = Date.now().toString(36).toUpperCase();
  const plataforma = await plataformaDoRun(request, baseURL!, sufixo);
  const nomeA = `Telhado A ${marcaDaExecucao()} ${sufixo} (sintético)`;
  const nomeB = `Telhado B ${marcaDaExecucao()} ${sufixo} (sintético)`;

  // 1. Nova usina pela tela: os obrigatórios e a potência com vírgula.
  await page.goto("/engenharia/usinas?aba=cadastro&empresa=waze");
  await page.getByRole("button", { name: "Nova usina" }).first().click();
  const nova = page.getByRole("dialog", { name: "Nova usina" });
  await nova.getByRole("button", { name: "Cadastrar usina" }).click();
  await expect(nova.getByText("Erro: escolha o cliente.")).toBeVisible();
  await nova.getByLabel(/^Nome da usina/).fill(nomeA);
  await nova.getByRole("searchbox", { name: /Cliente/ }).fill("Cliente com UC");
  await nova.getByRole("button", { name: new RegExp(literal(CLIENTE)) }).click(DEPOIS_DA_ACAO);
  await escolher(page, nova, /^Plataforma/, plataforma.nome);
  await nova.getByLabel(/^Potência/).fill("12,7555");
  await nova.getByRole("textbox", { name: /^Comissionada em/ }).fill(ontem());
  await nova.getByRole("button", { name: "Cadastrar usina" }).click();
  await expect(nova.getByText("Erro: use um número como 12,75.")).toBeVisible();
  await nova.getByLabel(/^Potência/).fill("12,75");
  await nova.getByRole("button", { name: "Cadastrar usina" }).click();
  await expect(page.locator(".aviso--sucesso")).toContainText(`${nomeA} cadastrada.`, DEPOIS_DA_ACAO);
  // A ficha abre com a potência em pt-BR.
  const ficha = page.getByRole("dialog", { name: nomeA });
  await expect(ficha.getByText("12,75 kWp").first()).toBeVisible(DEPOIS_DA_ACAO);
  await ficha.getByRole("button", { name: "Fechar" }).click();

  // A segunda usina pela API (mesmo cliente e UC, mesma plataforma).
  const busca = (await (await request.get(`/api/engenharia/ordens-de-servico/clientes?busca=${encodeURIComponent("Cliente com UC")}`)).json()) as { itens: { id: string; nome: string; ucs: { id: string }[] }[] };
  const cliente = busca.itens.find((c) => c.nome === CLIENTE)!;
  const criada = await request.post("/api/engenharia/usinas", { headers: { origin: baseURL! }, data: {
    empresa: "waze", clienteId: cliente.id, ucId: cliente.ucs[0]!.id, nome: nomeB, plataformaId: plataforma.id, potenciaKwp: "9.3", comissionadaEm: new Date(Date.now() - 4 * 3_600_000 - 86_400_000).toISOString().slice(0, 10),
  } });
  expect(criada.ok(), await criada.text()).toBeTruthy();

  // 2. Monitoramento de hoje: o card da plataforma do run, pendente.
  await page.goto("/engenharia/usinas?empresa=waze");
  const card = page.getByRole("article", { name: `${plataforma.nome}, pendente` });
  await expect(card).toBeVisible(DEPOIS_DA_ACAO);
  await card.getByRole("button", { name: `Conferir ${plataforma.nome}` }).click();
  const conferir = page.getByRole("dialog", { name: `Conferir ${plataforma.nome}` });

  // Sem print não conclui; anomalia pede o que foi visto e já marca "abrir O.S.".
  await escolher(page, conferir, new RegExp(`^Situação de ${literal(nomeB)}`), "Anomalia");
  await expect(conferir.getByRole("checkbox", { name: /Abrir O\.S\. de manutenção/ })).toBeChecked();
  await conferir.getByRole("button", { name: "Concluir conferência" }).click();
  await expect(conferir.getByText("Erro: anexe o print da plataforma.")).toBeVisible();
  await expect(conferir.getByText("Erro: descreva o que foi visto na plataforma.")).toBeVisible();
  await conferir.getByLabel(/^O que foi visto/).fill("Geração 40% abaixo do bloco A (sintético)");
  await conferir.locator("input[type=file]").setInputFiles(PNG);
  await conferir.getByRole("button", { name: "Concluir conferência" }).click();
  await expect(page.locator(".aviso--sucesso")).toContainText(/a partir do monitoramento/, DEPOIS_DA_ACAO);

  // O card mostra a exceção e a O.S.; a conferência fechada abre só para ver.
  const feita = page.getByRole("article", { name: `${plataforma.nome}, conferida` });
  await expect(feita.getByText(nomeB)).toBeVisible(DEPOIS_DA_ACAO);
  await expect(feita.getByRole("link", { name: /^OS-/ })).toBeVisible();
  await feita.getByRole("button", { name: `Ver a conferência de ${plataforma.nome}` }).click();
  const vista = page.getByRole("dialog", { name: `Conferência ${plataforma.nome}` });
  await expect(vista.getByText("Geração 40% abaixo do bloco A (sintético)")).toBeVisible();
  await expect(vista.getByRole("link", { name: "print-e2e.png" })).toBeVisible();
  await vista.getByRole("button", { name: "Fechar" }).first().click();

  // 3. No cadastro, a usina com atenção e a ficha com o monitoramento e a O.S.
  await page.goto(`/engenharia/usinas?aba=cadastro&atencao=sim&busca=${encodeURIComponent(sufixo)}`);
  await page.getByRole("button", { name: `Ver ${nomeB}` }).click();
  const fichaB = page.getByRole("dialog", { name: nomeB });
  await expect(fichaB.getByText("Anomalia").first()).toBeVisible(DEPOIS_DA_ACAO);
  await fichaB.getByRole("tab", { name: /^O\.S\./ }).click();
  await expect(fichaB.getByRole("link", { name: /^OS-/ })).toBeVisible();
});

test("importação: a planilha é conferida antes e grava só as linhas prontas", async ({ page, request, baseURL }) => {
  test.slow();
  await bloquearTerceiros(page);
  const sufixo = Date.now().toString(36).toUpperCase();
  const plataforma = await plataformaDoRun(request, baseURL!, `${sufixo}I`);
  const csv = [
    "Cliente;UC;Usina;Plataforma;kWp;Comissionamento",
    `${CLIENTE};UC-E2E-0001;Galpão ${marcaDaExecucao()} ${sufixo} (sintético);${plataforma.nome};22,8;2025-08-02`,
    `Cliente que não existe ${sufixo};UC-0;Linha com erro ${marcaDaExecucao()} ${sufixo};${plataforma.nome};10;2025-08-02`,
  ].join("\n");

  await page.goto("/engenharia/usinas?aba=cadastro");
  await page.getByRole("button", { name: "Importar planilha" }).click();
  const importar = page.getByRole("dialog", { name: "Importar planilha de usinas" });
  await importar.locator("input[type=file]").setInputFiles({ name: "levantamento-e2e.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await escolher(page, importar, /^Empresa das linhas/, "Waze Energia");
  await importar.getByRole("button", { name: "Conferir a planilha" }).click();
  await expect(importar.getByText(/2 linhas: 1 pronta/)).toBeVisible(DEPOIS_DA_ACAO);
  await expect(importar.getByRole("row").filter({ hasText: "Com erro" })).toHaveCount(1);
  await importar.getByRole("button", { name: "Gravar 1 usina" }).click();
  await expect(page.locator(".aviso--sucesso")).toContainText("1 usina importada da planilha.", DEPOIS_DA_ACAO);
  await page.goto(`/engenharia/usinas?aba=cadastro&busca=${encodeURIComponent(sufixo)}`);
  await expect(page.getByRole("article", { name: `Galpão ${marcaDaExecucao()} ${sufixo} (sintético)` })).toBeVisible(DEPOIS_DA_ACAO);
});
