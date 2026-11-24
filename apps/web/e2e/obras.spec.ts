import { expect, test } from "@playwright/test";

import { marcaDaExecucao } from "./support/execucao";
import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * Obras (PLU-350), no desktop: a Nova obra pela tela com o "Cliente com UC (exemplo)"
 * do seed, o primeiro marco feito e o cronograma do MS Project em duas versões. A
 * marca da execução vai no nome da obra, que a limpeza apaga com marcos e documentos.
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.221" }, contextOptions: { reducedMotion: "reduce" } });
const DEPOIS_DA_ACAO = { timeout: 15_000 };
const CLIENTE = "Cliente com UC (exemplo)";
const literal = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const manaus = (dias: number) => new Date(Date.now() - 4 * 3_600_000 + dias * 86_400_000).toISOString().slice(0, 10).split("-").reverse().join("/");
/** Um .mpp mínimo: a assinatura OLE do arquivo composto da Microsoft. */
const mpp = (nome: string) => ({ name: nome, mimeType: "application/vnd.ms-project", buffer: Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)]) });

test("nova obra com os 6 marcos; o próximo marco é feito; o cronograma ganha a versão 2", async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await bloquearTerceiros(page);
  const sufixo = Date.now().toString(36).toUpperCase();
  const nome = `Obra ${marcaDaExecucao()} ${sufixo} (sintética)`;

  // 1. Nova obra: o início pode ser passado; a entrega, só a partir de amanhã (o calendário avisa).
  await page.goto("/engenharia/obras?empresa=waze");
  await page.getByRole("button", { name: "Nova obra" }).first().click();
  const nova = page.getByRole("dialog", { name: "Nova obra" });
  await nova.getByLabel(/^Nome da obra/).fill(nome);
  await nova.getByLabel(/^Potência/).fill("61,2");
  await nova.getByRole("searchbox", { name: /Cliente/ }).fill("Cliente com UC");
  await nova.getByRole("button", { name: new RegExp(literal(CLIENTE)) }).click(DEPOIS_DA_ACAO);
  await nova.getByRole("textbox", { name: /^Início/ }).fill(manaus(-10));
  await nova.getByRole("textbox", { name: /^Entrega prevista/ }).fill(manaus(-10));
  await nova.getByRole("button", { name: "Criar obra" }).click();
  await expect(nova.getByText(`Erro: Escolha uma data a partir de ${manaus(1)}.`)).toBeVisible();
  await nova.getByRole("textbox", { name: /^Entrega prevista/ }).fill(manaus(60));
  await nova.getByRole("button", { name: "Criar obra" }).click();
  await expect(page.locator(".aviso--sucesso")).toContainText(`${nome} criada com os 6 marcos.`, DEPOIS_DA_ACAO);

  // 2. A ficha abre nos marcos: só o próximo tem "Marcar como feito".
  const ficha = page.getByRole("dialog", { name: nome });
  const marcos = ficha.getByRole("list", { name: "Marcos, na ordem" });
  await expect(marcos.getByRole("listitem")).toHaveCount(6, DEPOIS_DA_ACAO);
  await expect(ficha.getByRole("button", { name: "Marcar como feito" })).toHaveCount(1);
  await marcos.getByRole("listitem").filter({ hasText: "Contrato assinado" }).getByRole("button", { name: "Marcar como feito" }).click();
  await expect(ficha.getByText('Marco "Contrato assinado" feito.')).toBeVisible(DEPOIS_DA_ACAO);
  await expect(ficha.getByText("1 de 6 marcos")).toBeVisible();
  await expect(marcos.getByRole("listitem").filter({ hasText: "Projeto aprovado" }).getByRole("button", { name: "Marcar como feito" })).toBeVisible();

  // Reprogramar um marco pendente: só dentro do período da obra.
  await marcos.getByRole("button", { name: "Reprogramar Material entregue" }).click();
  const reprogramar = page.getByRole("dialog", { name: "Reprogramar Material entregue" });
  await reprogramar.getByRole("textbox", { name: /^Nova data prevista/ }).fill(manaus(61));
  await reprogramar.getByRole("button", { name: "Reprogramar" }).click();
  await expect(reprogramar.getByText(`Erro: Escolha uma data até ${manaus(60)}.`)).toBeVisible();
  await reprogramar.getByRole("textbox", { name: /^Nova data prevista/ }).fill(manaus(20));
  await reprogramar.getByRole("button", { name: "Reprogramar" }).click();
  await expect(ficha.getByText('Marco "Material entregue" reprogramado.')).toBeVisible(DEPOIS_DA_ACAO);
  await expect(marcos.getByRole("listitem").filter({ hasText: "Material entregue" })).toContainText(`Previsto para ${manaus(20)}`);

  // 3. Cronograma do MS Project: anexar e, depois, a nova versão; a anterior fica no histórico.
  await ficha.getByRole("tab", { name: /^Documentos/ }).click();
  await ficha.getByRole("button", { name: "Anexar cronograma" }).click();
  const anexar = page.getByRole("dialog", { name: "Anexar cronograma" });
  await anexar.locator("input[type=file]").setInputFiles(mpp("Cronograma E2E.mpp"));
  await anexar.getByRole("button", { name: "Enviar" }).click();
  await expect(ficha.getByText("Documento anexado à obra.")).toBeVisible(DEPOIS_DA_ACAO);
  await ficha.getByRole("button", { name: "Nova versão" }).click();
  const versao = page.getByRole("dialog", { name: /^Nova versão de / });
  await versao.locator("input[type=file]").setInputFiles(mpp("Cronograma E2E v2.mpp"));
  await versao.getByRole("button", { name: "Enviar" }).click();
  await expect(ficha.getByText("Cronograma do MS Project na versão 2; a anterior ficou no histórico.")).toBeVisible(DEPOIS_DA_ACAO);
  await expect(ficha.getByRole("list", { name: /^Versões anteriores de / }).getByText(/^Versão 1 ·/)).toBeVisible();

  // 4. O card mostra o progresso dos marcos e o clipe dos documentos.
  await page.goto(`/engenharia/obras?busca=${encodeURIComponent(sufixo)}`);
  const card = page.getByRole("article", { name: nome });
  await expect(card).toContainText("1 de 6 marcos", DEPOIS_DA_ACAO);
  await expect(card).toContainText("Próximo: Projeto aprovado");
});

test("o pedido de compra escolhe a obra do cadastro, sem criar obra (PLU-355)", async ({ page, request, baseURL }) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await bloquearTerceiros(page);
  const H = { origin: baseURL! };
  const sufixo = Date.now().toString(36).toUpperCase();
  const nome = `Obra ${marcaDaExecucao()} ${sufixo} compras (sintética)`;
  const busca = (await (await request.get(`/api/engenharia/obras/clientes?busca=${encodeURIComponent("Cliente com UC")}`)).json()) as { itens: { id: string; nome: string }[] };
  const cliente = busca.itens.find((c) => c.nome === CLIENTE)!;
  const dia = (n: number) => new Date(Date.now() - 4 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);
  const criada = await request.post("/api/engenharia/obras", { headers: H, data: { empresa: "waze", clienteId: cliente.id, nome, potenciaKwp: "10", inicioEm: dia(0), entregaPrevistaEm: dia(30) } });
  expect(criada.ok(), await criada.text()).toBeTruthy();

  await page.goto("/suprimentos/compras");
  await page.getByRole("button", { name: "Novo pedido" }).first().click();
  const novo = page.getByRole("dialog", { name: "Novo pedido de compra" });
  await novo.getByRole("radio", { name: "Waze Energia" }).click();
  await novo.getByRole("radio", { name: "Obra" }).click();
  await expect(novo.getByText("Sem a obra na lista? Ela é cadastrada na tela de Obras da Engenharia.")).toBeVisible();
  await expect(novo.getByRole("button", { name: "Nova obra" })).toHaveCount(0);
  await novo.getByRole("combobox", { name: /^Obra/ }).click();
  await expect(page.getByRole("option", { name: new RegExp(literal(nome)) })).toBeVisible(DEPOIS_DA_ACAO);
});

test("a O.S. escolhe a obra do mesmo cliente e empresa e aparece na aba O.S. da obra", async ({ page, request, baseURL }) => {
  test.slow();
  await page.setViewportSize({ width: 1440, height: 900 });
  await bloquearTerceiros(page);
  const H = { origin: baseURL! };
  const sufixo = Date.now().toString(36).toUpperCase();
  const nome = `Obra ${marcaDaExecucao()} ${sufixo} O.S. (sintética)`;
  const busca = (await (await request.get(`/api/engenharia/obras/clientes?busca=${encodeURIComponent("Cliente com UC")}`)).json()) as { itens: { id: string; nome: string }[] };
  const cliente = busca.itens.find((c) => c.nome === CLIENTE)!;
  const dia = (n: number) => new Date(Date.now() - 4 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);
  const criada = await request.post("/api/engenharia/obras", { headers: H, data: { empresa: "waze", clienteId: cliente.id, nome, potenciaKwp: "10", inicioEm: dia(0), entregaPrevistaEm: dia(30) } });
  expect(criada.ok(), await criada.text()).toBeTruthy();
  const { id: obraId } = (await criada.json()) as { id: string };
  const descricao = `Instalação ${marcaDaExecucao()} ${sufixo} (sintético)`;

  await page.goto("/engenharia/ordens-de-servico");
  await page.getByRole("button", { name: "Nova O.S." }).first().click();
  const nova = page.getByRole("dialog", { name: "Nova O.S." });
  await nova.getByRole("combobox", { name: /^Empresa/ }).click();
  await page.getByRole("option", { name: "Waze Energia" }).click();
  await nova.getByRole("combobox", { name: /^Tipo/ }).click();
  await page.getByRole("option", { name: "Instalação" }).click();
  await nova.getByRole("searchbox", { name: /Cliente/ }).fill("Cliente com UC");
  await nova.getByRole("button", { name: new RegExp(literal(CLIENTE)) }).click(DEPOIS_DA_ACAO);
  await nova.getByRole("combobox", { name: /^Obra/ }).click(DEPOIS_DA_ACAO);
  await page.getByRole("option", { name: nome }).click();
  await nova.getByRole("textbox", { name: /O que precisa ser feito/ }).fill(descricao);
  await nova.getByRole("textbox", { name: /^Prazo/ }).fill(dia(5).split("-").reverse().join("/"));
  await nova.getByRole("button", { name: "Criar O.S." }).click();
  const fichaDaOs = page.locator("dialog[open]").first();
  await expect(fichaDaOs.getByRole("definition").filter({ hasText: nome })).toBeVisible(DEPOIS_DA_ACAO);

  // Na ficha da obra, a O.S. entra na aba O.S.
  await page.goto(`/engenharia/obras?obra=${obraId}`);
  const fichaDaObra = page.getByRole("dialog", { name: nome });
  await fichaDaObra.getByRole("tab", { name: /^O\.S\./ }).click(DEPOIS_DA_ACAO);
  await expect(fichaDaObra.getByText(new RegExp(literal(descricao)))).toBeVisible(DEPOIS_DA_ACAO);
});
