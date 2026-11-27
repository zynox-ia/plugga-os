import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CONTRAPARTES_DE_EXEMPLO } from "../app/lib/notas-fiscais-exemplo.ts";
import { dadosDaNfe, empresaPeloNome, preencherComANfe } from "../app/lib/notas-fiscais-xml.ts";
import type { CamposDaNota } from "../app/lib/notas-fiscais.ts";

/** Uma NF-e INVENTADA, só com a estrutura que a regra lê (nada de nota real). */
function nfe({ numero = "000045901", emissao = "<dhEmi>2026-11-20T10:15:00-04:00</dhEmi>", valor = "8432.17", emitente = "Distribuidora Amazônia Cabos", destinatario = "Waze Energia", prefixo = "" } = {}) {
  const t = (nome: string, conteudo: string) => `<${prefixo}${nome}>${conteudo}</${prefixo}${nome}>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<${prefixo}nfeProc xmlns${prefixo ? `:${prefixo.slice(0, -1)}` : ""}="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <${prefixo}NFe><${prefixo}infNFe Id="NFe00000000000000000000000000000000000000000000" versao="4.00">
    ${t("ide", `${t("cUF", "13")}${t("nNF", numero)}${emissao}`)}
    ${t("emit", `${t("CNPJ", "00000000000000")}${t("xNome", emitente)}`)}
    ${t("dest", `${t("CNPJ", "11111111111111")}${t("xNome", destinatario)}`)}
    ${t("total", t("ICMSTot", `${t("vProd", "1.00")}${t("vNF", valor)}`))}
  </${prefixo}infNFe></${prefixo}NFe>
</${prefixo}nfeProc>`;
}

const vazios = (parcial: Partial<CamposDaNota> = {}): CamposDaNota => ({
  tipo: "entrada", empresa: "", numero: "", emitidaEm: "2026-11-27", valor: "", contraparteId: "", lancamento: "", arquivo: null, ...parcial,
});
const contexto = (tocados: string[] = []) => ({ contrapartes: CONTRAPARTES_DE_EXEMPLO, tocados: new Set(tocados) as Set<never> });

describe("leitura do XML da NF-e (PLU-361)", () => {
  it("lê número (sem zeros à esquerda), emissão (dhEmi), valor e os nomes, com ou sem prefixo de namespace", () => {
    const esperado = { numero: "45901", emitidaEm: "2026-11-20", valor: "8432.17", emitente: "Distribuidora Amazônia Cabos", destinatario: "Waze Energia" };
    assert.deepEqual(dadosDaNfe(nfe(), true), esperado);
    assert.deepEqual(dadosDaNfe(nfe({ prefixo: "nfe:" }), true), esperado);
  });

  it("aceita a emissão antiga (dEmi) e completa o valor com duas casas", () => {
    const dados = dadosDaNfe(nfe({ emissao: "<dEmi>2025-03-07</dEmi>", valor: "980.5" }), true);
    assert.equal(dados?.emitidaEm, "2025-03-07");
    assert.equal(dados?.valor, "980.50");
  });

  it("XML malformado (o DOMParser acusa) ou cortado não preenche nada", () => {
    assert.equal(dadosDaNfe(nfe(), false), null);
    assert.equal(dadosDaNfe(nfe().slice(0, 300), true), null);
  });

  it("XML que não é NF-e não preenche nada", () => {
    assert.equal(dadosDaNfe('<?xml version="1.0"?><pedido><numero>12</numero></pedido>', true), null);
    assert.equal(dadosDaNfe("", true), null);
  });

  it("NF-e sem os campos devolve nulos, sem inventar", () => {
    const semNada = '<nfeProc><NFe><infNFe Id="x"><ide><cUF>13</cUF></ide></infNFe></NFe></nfeProc>';
    assert.deepEqual(dadosDaNfe(semNada, true), { numero: null, emitidaEm: null, valor: null, emitente: null, destinatario: null });
    // Valores fora do formato também ficam de fora.
    const torto = dadosDaNfe(nfe({ numero: "12A", emissao: "<dhEmi>ontem</dhEmi>", valor: "1.234,56" }), true);
    assert.deepEqual([torto?.numero, torto?.emitidaEm, torto?.valor], [null, null, null]);
  });

  it("a empresa do grupo pelo nome", () => {
    assert.equal(empresaPeloNome("Waze Energia Ltda"), "waze");
    assert.equal(empresaPeloNome("PLUGGA SERVIÇOS"), "plugga");
    assert.equal(empresaPeloNome("Distribuidora Amazônia Cabos"), null);
    assert.equal(empresaPeloNome(null), null);
  });
});

describe("o XML preenche o formulário (PLU-361)", () => {
  it("nota recebida pela Waze: vira saída, com empresa, número, emissão, valor e o fornecedor de nome igual", () => {
    const { campos, preenchidos } = preencherComANfe(vazios(), dadosDaNfe(nfe(), true), contexto());
    assert.deepEqual({ ...campos, arquivo: undefined }, { tipo: "saida", empresa: "waze", numero: "45901", emitidaEm: "2026-11-20", valor: "8432.17", contraparteId: "f-cabos", lancamento: "", arquivo: undefined });
    assert.deepEqual(preenchidos, ["tipo", "empresa", "numero", "emitidaEm", "valor", "contraparteId"]);
  });

  it("nota emitida pela Plugga: vira entrada, e o cliente só entra se o nome bater exatamente", () => {
    const igual = preencherComANfe(vazios({ tipo: "saida" }), dadosDaNfe(nfe({ emitente: "Plugga", destinatario: "Mercado Ponte Nova" }), true), contexto());
    assert.equal(igual.campos.tipo, "entrada");
    assert.equal(igual.campos.empresa, "plugga");
    assert.equal(igual.campos.contraparteId, "c-ponte");
    const parecido = preencherComANfe(vazios(), dadosDaNfe(nfe({ emitente: "Plugga", destinatario: "MERCADO PONTE NOVA LTDA" }), true), contexto());
    assert.equal(parecido.campos.contraparteId, "");
    assert.ok(!parecido.preenchidos.includes("contraparteId"));
  });

  it("não sobrescreve o que já foi digitado nem o que a pessoa mexeu", () => {
    const digitados = vazios({ tipo: "saida", numero: "777", valor: "10.00", contraparteId: "f-solar" });
    const { campos, preenchidos } = preencherComANfe(digitados, dadosDaNfe(nfe(), true), contexto(["emitidaEm"]));
    assert.equal(campos.numero, "777");
    assert.equal(campos.valor, "10.00");
    assert.equal(campos.contraparteId, "f-solar");
    assert.equal(campos.emitidaEm, "2026-11-27", "a emissão mexida pela pessoa fica");
    assert.deepEqual(preenchidos, ["empresa"]);
    // Empresa escolhida pela pessoa também fica.
    assert.equal(preencherComANfe(vazios({ tipo: "saida", empresa: "plugga" }), dadosDaNfe(nfe(), true), contexto(["empresa"])).campos.empresa, "plugga");
  });

  it("com cliente, fornecedor ou lançamento escolhidos, o tipo não muda", () => {
    const comCliente = preencherComANfe(vazios({ tipo: "entrada", contraparteId: "c-ponte" }), dadosDaNfe(nfe(), true), contexto());
    assert.equal(comCliente.campos.tipo, "entrada");
    assert.equal(comCliente.campos.contraparteId, "c-ponte");
  });

  it("sem dados (malformado, não NF-e) nada muda e nada é marcado como lido", () => {
    const antes = vazios();
    const { campos, preenchidos } = preencherComANfe(antes, dadosDaNfe("<quebrado", false), contexto());
    assert.deepEqual(campos, antes);
    assert.deepEqual(preenchidos, []);
  });
});
