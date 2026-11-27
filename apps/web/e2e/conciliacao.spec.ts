import { expect as expectPadrao, test, type Page } from "@playwright/test";

import { marcaDaExecucao } from "./support/execucao";
import { bloquearTerceiros } from "./support/sem-terceiros";

/**
 * Conciliação (PLU-339): o operador importa o extrato OFX, o par com valor diferente
 * é corrigido pela mesma ação da ficha (com motivo), vira sugerido, é conciliado e a
 * gerência desfaz com motivo. Dados sintéticos: a conta paga e o fornecedor levam a
 * marca da execução e saem no teardown; a conta corrente e o movimento do extrato ficam
 * (cadastro e extrato não se apagam, e a CI descarta o banco).
 */

test.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.239" } });

const expect = expectPadrao.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 120_000 });

const PDF_SINTETICO = Buffer.from(["%PDF-1.4", "% comprovante sintetico", "1 0 obj << >> endobj", "trailer << >>", "%%EOF", ""].join("\n"));

/** O dia em Manaus, `dias` atrás, como a API conta ("não pode ser futuro"). */
function diaEmManaus(diasAtras: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus" }).format(new Date(Date.now() - diasAtras * 86_400_000));
}

function ofx(dia: string, valor: string, fitid: string, memo: string): Buffer {
  const d = dia.replaceAll("-", "");
  return Buffer.from([
    "OFXHEADER:100", "DATA:OFXSGML", "VERSION:102", "SECURITY:NONE", "ENCODING:USASCII", "CHARSET:1252", "COMPRESSION:NONE", "OLDFILEUID:NONE", "NEWFILEUID:NONE", "",
    "<OFX>", "<BANKMSGSRSV1><STMTTRNRS><STMTRS>", "<CURDEF>BRL", "<BANKTRANLIST>",
    `<DTSTART>${d}000000[-4:AMT]`, `<DTEND>${d}235959[-4:AMT]`,
    "<STMTTRN>", "<TRNTYPE>DEBIT", `<DTPOSTED>${d}100000[-4:AMT]`, `<TRNAMT>${valor}`, `<FITID>${fitid}`, `<MEMO>${memo}`, "</STMTTRN>",
    "</BANKTRANLIST>", "</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>", "",
  ].join("\r\n"), "latin1");
}

/** A conta paga no dia, pela API (pelos proxies da web): o lado do Plugga OS do par. */
async function contaPaga(page: Page, baseURL: string, descricao: string, contaCorrenteId: string, dia: string) {
  const headers = { origin: new URL(baseURL).origin };
  const fornecedor = await page.request.post("/api/suprimentos/fornecedores", { data: { nome: `Fornecedor ${descricao}`, categoria: "servico" }, headers });
  expect(fornecedor.status(), await fornecedor.text()).toBe(201);
  const { id: fornecedorId } = (await fornecedor.json()) as { id: string };

  const criada = await page.request.post("/api/financeiro/lancamentos", {
    data: { empresa: "plugga", fornecedorId, contaCorrenteId, descricao, valor: "450.00", vencimento: dia, forma: "pix" }, headers,
  });
  expect(criada.status(), await criada.text()).toBe(201);
  const { id, codigo } = (await criada.json()) as { id: string; codigo: string };

  const aprovada = await page.request.post(`/api/financeiro/lancamentos/${id}/acoes`, { data: { acao: "aprovar" }, headers });
  expect(aprovada.status(), await aprovada.text()).toBe(200);
  const anexo = await page.request.post(`/api/financeiro/lancamentos/${id}/anexos`, {
    multipart: { tipo: "comprovante", arquivo: { name: "comprovante-sintetico.pdf", mimeType: "application/pdf", buffer: PDF_SINTETICO } }, headers,
  });
  expect(anexo.status(), await anexo.text()).toBe(201);
  const paga = await page.request.post(`/api/financeiro/lancamentos/${id}/acoes`, { data: { acao: "registrar_pagamento", forma: "pix", contaCorrenteId, pagoEm: dia }, headers });
  expect(paga.status(), await paga.text()).toBe(200);
  return codigo;
}

/** O número de um stat da faixa ("Valor diferente", "Saldo conciliado"…), pelo rótulo. */
const stat = (escopo: ReturnType<Page["getByRole"]>, rotulo: string) => escopo.locator(`span:has(> small:text-is("${rotulo}")) > strong`);

test("importar o OFX, corrigir o valor diferente, conciliar e desfazer com motivo", async ({ page, baseURL }) => {
  await bloquearTerceiros(page);
  const marca = `${marcaDaExecucao()} ${Date.now().toString(36)}`;
  const headers = { origin: new URL(baseURL!).origin };
  // Uma conta só desta tentativa, com saldo inicial conhecido na véspera do pagamento: o par é
  // único dos dois lados mesmo num retry ou com outros specs em paralelo, e os saldos são exatos.
  // A conta fica (cadastro não se apaga; a CI descarta o banco).
  const dia = diaEmManaus(40);
  const novaConta = await page.request.post("/api/financeiro/contas-correntes", {
    data: { empresa: "plugga", nome: `Conta ${marca} (sintética)`, saldoInicial: "1000.00", saldoInicialEm: diaEmManaus(41) }, headers,
  });
  expect(novaConta.status(), await novaConta.text()).toBe(201);
  const { id: contaId } = (await novaConta.json()) as { id: string };
  const codigo = await contaPaga(page, baseURL!, `Manutenção ${marca} (sintético)`, contaId, dia);

  // O extrato tem o débito com R$ 17,35 a mais (juros): o par cai em "Valor diferente".
  const memo = `PIX MANUTENCAO ${marca.replace(/[^A-Za-z0-9 ]/g, "")} SINTETICO`;
  await page.goto(`/financeiro/conciliacao?conta=${contaId}&de=${dia.slice(0, 8)}01&ate=${dia}`);
  await page.getByRole("button", { name: "Ler extrato" }).click();
  const importar = page.getByRole("dialog", { name: "Importar extrato OFX" });
  await importar.locator('input[type="file"]').setInputFiles({ name: "extrato-sintetico.ofx", mimeType: "application/x-ofx", buffer: ofx(dia, "-467.35", `E2E-${Date.now().toString(36)}`, memo) });
  await importar.getByRole("button", { name: "Importar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "1 movimento novo" })).toBeVisible();

  // A faixa conta a divergência; o saldo: 1.000,00 − 450,00 pago, nada conciliado ainda.
  const faixa = page.getByRole("region", { name: "Progresso da conciliação" });
  const saldos = page.getByRole("group", { name: "Saldos da conciliação" });
  await expect(faixa.getByRole("heading", { name: "0 de 1 conciliados" })).toBeVisible();
  await expect(stat(faixa, "Valor diferente")).toHaveText("1");
  await expect(stat(faixa, "Sugeridos")).toHaveText("0");
  await expect(stat(faixa, "Sem par")).toContainText("0");
  await expect(stat(saldos, "Saldo no Plugga OS")).toHaveText("R$ 550,00");
  await expect(stat(saldos, "Saldo conciliado")).toHaveText("R$ 1.000,00");
  await expect(stat(saldos, "Diferença líquida")).toHaveText(/^-s?R$s?450,00$/);

  const diferente = page.getByRole("region", { name: "Valor diferente" }).getByRole("listitem").filter({ hasText: memo });
  await expect(diferente.getByText("Diferença R$ 17,35 a menos no Plugga OS")).toBeVisible();
  await expect(diferente.getByRole("button", { name: "Conciliar" })).toHaveCount(0);

  // Corrigir: a ação da ficha, já com o valor do extrato, e o motivo obrigatório.
  await diferente.getByRole("button", { name: "Corrigir" }).click();
  const correcao = page.getByRole("dialog", { name: `Corrigir o valor de ${codigo}` });
  await expect(correcao.getByLabel("Novo valor")).toHaveValue("467,35");
  await correcao.getByRole("button", { name: "Corrigir valor" }).click();
  await expect(correcao.getByText("diga por que o valor mudou.").first()).toBeVisible();
  await correcao.getByLabel("Motivo").fill("Juros do atraso (sintético)");
  await correcao.getByRole("button", { name: "Corrigir valor" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${codigo}: valor corrigido` })).toBeVisible();

  // Com o mesmo valor, o par vira sugerido; o saldo já sai com os juros.
  await expect(stat(faixa, "Valor diferente")).toHaveText("0");
  await expect(stat(faixa, "Sugeridos")).toHaveText("1");
  await expect(stat(saldos, "Saldo no Plugga OS")).toHaveText("R$ 532,65");
  await expect(stat(saldos, "Diferença líquida")).toHaveText(/^-s?R$s?467,35$/);
  const sugerido = page.getByRole("region", { name: "Sugeridos" }).getByRole("listitem").filter({ hasText: memo });
  await expect(sugerido.getByText("R$ 467,35")).toHaveCount(2);
  await sugerido.getByRole("button", { name: "Conciliar" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${codigo} conciliado.` })).toBeVisible();
  await expect(faixa.getByRole("heading", { name: "1 de 1 conciliados" })).toBeVisible();
  await expect(stat(saldos, "Saldo conciliado")).toHaveText("R$ 532,65");
  await expect(stat(saldos, "Diferença líquida")).toHaveText("R$ 0,00");

  // Desfazer é da gerência e pede o motivo; o conferido volta ao saldo inicial.
  const conciliados = page.getByRole("region", { name: "Conciliados" });
  await conciliados.getByRole("button", { name: /^Ver os/ }).click();
  await conciliados.getByRole("listitem").filter({ hasText: memo }).getByRole("button", { name: "Desfazer" }).click();
  const desfazer = page.getByRole("dialog", { name: "Desfazer conciliação" });
  await desfazer.getByRole("button", { name: "Desfazer" }).click();
  await expect(desfazer.getByText("informe o motivo, com pelo menos 3 letras.").first()).toBeVisible();
  await desfazer.getByLabel("Motivo").fill("Par conferido errado (sintético)");
  await desfazer.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Conciliação desfeita." })).toBeVisible();
  await expect(faixa.getByRole("heading", { name: "0 de 1 conciliados" })).toBeVisible();
  await expect(stat(saldos, "Saldo conciliado")).toHaveText("R$ 1.000,00");
  await expect(page.getByRole("region", { name: "Sugeridos" }).getByRole("listitem").filter({ hasText: memo })).toBeVisible();
});

test("a 390 px, a Conciliação não rola na horizontal", async ({ page }) => {
  await bloquearTerceiros(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/financeiro/conciliacao");
  await expect(page.getByRole("region", { name: "Progresso da conciliação" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
