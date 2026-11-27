import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CONTRAPARTES_DE_EXEMPLO } from "../app/lib/notas-fiscais-exemplo.ts";
import { dadosDaNfe, empresaPeloNome, LIMITE_DA_LEITURA_DO_XML, LIMITES_DO_XML, podeLerOXml, preencherComANfe, sequenciaDeLeituras } from "../app/lib/notas-fiscais-xml.ts";
import type { CamposDaNota } from "../app/lib/notas-fiscais.ts";

/** Uma NF-e INVENTADA, só com a estrutura que a regra lê (nada de nota real). */
function nfe({ numero = "000045901", emissao = "<dhEmi>2026-11-20T10:15:00-04:00</dhEmi>", valor = "8432.17", emitente = "Distribuidora Amazônia Cabos", destinatario = "Waze Energia", prefixo = "" } = {}) {
  const t = (nome: string, conteudo: string) => `<${prefixo}${nome}>${conteudo}</${prefixo}${nome}>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<${prefixo}nfeProc xmlns${prefixo ? `:${prefixo.slice(0, -1)}` : ""}="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <${prefixo}NFe><${prefixo}infNFe Id="NFe00000000000000000000000000000000000000000000" versao="4.00">
    ${t("ide", `${t("cUF", "13")}${t("nNF", numero)}${emissao.replace(/<(\/?)(\w)/g, `<$1${prefixo}$2`)}`)}
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
    assert.deepEqual(dadosDaNfe(nfe()), esperado);
    assert.deepEqual(dadosDaNfe(nfe({ prefixo: "nfe:" })), esperado);
  });

  it("aceita a emissão antiga (dEmi) e completa o valor com duas casas", () => {
    const dados = dadosDaNfe(nfe({ emissao: "<dEmi>2025-03-07</dEmi>", valor: "980.5" }));
    assert.equal(dados?.emitidaEm, "2025-03-07");
    assert.equal(dados?.valor, "980.50");
  });

  it("XML malformado ou cortado não preenche nada", () => {
    assert.equal(dadosDaNfe(nfe().replace("</ide>", "</emit>")), null, "fechamento trocado");
    assert.equal(dadosDaNfe(nfe().slice(0, 300)), null, "cortado");
  });

  it("XML que não é NF-e não preenche nada", () => {
    assert.equal(dadosDaNfe('<?xml version="1.0"?><pedido><numero>12</numero></pedido>'), null);
    assert.equal(dadosDaNfe(""), null);
  });

  it("NF-e sem os campos devolve nulos, sem inventar", () => {
    const semNada = '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="x"><ide><cUF>13</cUF></ide></infNFe></NFe></nfeProc>';
    assert.deepEqual(dadosDaNfe(semNada), { numero: null, emitidaEm: null, valor: null, emitente: null, destinatario: null });
    // Valores fora do formato também ficam de fora.
    const torto = dadosDaNfe(nfe({ numero: "12A", emissao: "<dhEmi>ontem</dhEmi>", valor: "1.234,56" }));
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
    const { campos, preenchidos } = preencherComANfe(vazios(), dadosDaNfe(nfe()), contexto());
    assert.deepEqual({ ...campos, arquivo: undefined }, { tipo: "saida", empresa: "waze", numero: "45901", emitidaEm: "2026-11-20", valor: "8432.17", contraparteId: "f-cabos", lancamento: "", arquivo: undefined });
    assert.deepEqual(preenchidos, ["tipo", "empresa", "numero", "emitidaEm", "valor", "contraparteId"]);
  });

  it("nota emitida pela Plugga: vira entrada, e o cliente só entra se o nome bater exatamente", () => {
    const igual = preencherComANfe(vazios({ tipo: "saida" }), dadosDaNfe(nfe({ emitente: "Plugga", destinatario: "Mercado Ponte Nova" })), contexto());
    assert.equal(igual.campos.tipo, "entrada");
    assert.equal(igual.campos.empresa, "plugga");
    assert.equal(igual.campos.contraparteId, "c-ponte");
    const parecido = preencherComANfe(vazios(), dadosDaNfe(nfe({ emitente: "Plugga", destinatario: "MERCADO PONTE NOVA LTDA" })), contexto());
    assert.equal(parecido.campos.contraparteId, "");
    assert.ok(!parecido.preenchidos.includes("contraparteId"));
  });

  it("não sobrescreve o que já foi digitado nem o que a pessoa mexeu", () => {
    const digitados = vazios({ tipo: "saida", numero: "777", valor: "10.00", contraparteId: "f-solar" });
    const { campos, preenchidos } = preencherComANfe(digitados, dadosDaNfe(nfe()), contexto(["emitidaEm"]));
    assert.equal(campos.numero, "777");
    assert.equal(campos.valor, "10.00");
    assert.equal(campos.contraparteId, "f-solar");
    assert.equal(campos.emitidaEm, "2026-11-27", "a emissão mexida pela pessoa fica");
    assert.deepEqual(preenchidos, ["empresa"]);
    // Empresa escolhida pela pessoa também fica.
    assert.equal(preencherComANfe(vazios({ tipo: "saida", empresa: "plugga" }), dadosDaNfe(nfe()), contexto(["empresa"])).campos.empresa, "plugga");
  });

  it("com cliente, fornecedor ou lançamento escolhidos, o tipo não muda", () => {
    const comCliente = preencherComANfe(vazios({ tipo: "entrada", contraparteId: "c-ponte" }), dadosDaNfe(nfe()), contexto());
    assert.equal(comCliente.campos.tipo, "entrada");
    assert.equal(comCliente.campos.contraparteId, "c-ponte");
  });

  it("sem dados (malformado, não NF-e) nada muda e nada é marcado como lido", () => {
    const antes = vazios();
    const { campos, preenchidos } = preencherComANfe(antes, dadosDaNfe("<quebrado"), contexto());
    assert.deepEqual(campos, antes);
    assert.deepEqual(preenchidos, []);
  });
});

describe("leitura segura do XML da NF-e (PLU-361)", () => {
  it("só lê arquivo de até 2 MB: acima disso o arquivo anexa sem preencher e sem ser lido", () => {
    assert.equal(LIMITE_DA_LEITURA_DO_XML, 2 * 1024 * 1024);
    assert.equal(podeLerOXml(40 * 1024), true);
    assert.equal(podeLerOXml(LIMITE_DA_LEITURA_DO_XML), true);
    assert.equal(podeLerOXml(LIMITE_DA_LEITURA_DO_XML + 1), false);
    assert.equal(podeLerOXml(25 * 1024 * 1024 + 1), false);
  });

  it("não interpreta DTD nem entidades: DOCTYPE ou ENTITY, em qualquer caixa, não preenche nada", () => {
    const comDoctype = nfe().replace("<nfeProc", '<!DOCTYPE nfeProc [<!ENTITY xxe "boom">]><nfeProc');
    assert.equal(dadosDaNfe(comDoctype), null);
    assert.equal(dadosDaNfe(nfe().replace("<nfeProc", "<!doctype nfeProc><nfeProc")), null);
    assert.equal(dadosDaNfe(nfe().replace("<nfeProc", '<!ENTITY x "y"><nfeProc')), null);
    assert.equal(dadosDaNfe(nfe({ emitente: "A &desconhecida; B" })), null, "entidade que não é das cinco do XML");
  });

  it("comentário com um <nNF> falso não vira o número, e o verdadeiro vale", () => {
    const so = nfe({ numero: "" }).replace("<nNF></nNF>", "<!-- <nNF>999</nNF> -->");
    assert.equal(dadosDaNfe(so)?.numero, null);
    const ambos = nfe({ numero: "77" }).replace("<ide>", "<ide><!-- <nNF>999</nNF> -->");
    assert.equal(dadosDaNfe(ambos)?.numero, "77");
    const valorFalso = nfe().replace("<total>", "<!-- <vNF>1.00</vNF> --><total>");
    assert.equal(dadosDaNfe(valorFalso)?.valor, "8432.17");
  });

  it("CDATA é texto: tags dentro dele não viram campo", () => {
    const xml = nfe({ numero: "5" }).replace("<xNome>Distribuidora Amazônia Cabos</xNome>", "<xNome><![CDATA[<nNF>999</nNF> Cabos & Cia]]></xNome>");
    const dados = dadosDaNfe(xml);
    assert.equal(dados?.numero, "5");
    assert.equal(dados?.emitente, "<nNF>999</nNF> Cabos & Cia");
  });

  it("só vale o que está no namespace da NF-e, no caminho certo", () => {
    assert.equal(dadosDaNfe(nfe().replace('xmlns="http://www.portalfiscal.inf.br/nfe"', 'xmlns="http://exemplo.invalido/outra"')), null);
    // vNF fora de total/ICMSTot e nNF fora de ide não contam
    const fora = '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe><nNF>9</nNF><vNF>1.00</vNF></infNFe></NFe></nfeProc>';
    assert.deepEqual(dadosDaNfe(fora), { numero: null, emitidaEm: null, valor: null, emitente: null, destinatario: null });
  });

  it("decodifica as cinco entidades do XML e as referências numéricas", () => {
    assert.equal(dadosDaNfe(nfe({ emitente: "Cabos &amp; Cia &#233; &#xE9;" }))?.emitente, "Cabos & Cia é é");
  });

  it("o namespace da NF-e escrito com referência numérica equivalente vale: compara o valor decodificado", () => {
    const decimal = nfe().replace('xmlns="http://www.portalfiscal.inf.br/nfe"', 'xmlns="http&#58;//www.portalfiscal.inf.br/nfe"');
    const hexa = nfe().replace('xmlns="http://www.portalfiscal.inf.br/nfe"', 'xmlns="http&#x3A;&#x2F;&#x2F;www.portalfiscal.inf.br/nfe"');
    assert.equal(dadosDaNfe(decimal)?.numero, "45901");
    assert.equal(dadosDaNfe(hexa)?.numero, "45901");
    // e o decodificado diferente continua recusado
    assert.equal(dadosDaNfe(nfe().replace('xmlns="http://www.portalfiscal.inf.br/nfe"', 'xmlns="http&#58;//www.portalfiscal.inf.br/outra"')), null);
  });

  it("aceita o XML que começa com a marca de ordem de bytes (BOM)", () => {
    assert.equal(dadosDaNfe("﻿" + nfe())?.numero, "45901");
  });

  it("estrutura torta, dois raízes ou profundidade absurda não preenchem nada", () => {
    assert.equal(dadosDaNfe(nfe() + "<outra/>"), null);
    assert.equal(dadosDaNfe("<a>".repeat(200) + "</a>".repeat(200)), null);
    assert.equal(dadosDaNfe("<nfeProc xmlns='http://www.portalfiscal.inf.br/nfe'><NFe><infNFe></NFe></nfeProc>"), null);
  });

  it("troca rápida de arquivo: só a leitura mais recente vale", () => {
    const leituras = sequenciaDeLeituras();
    const primeira = leituras.nova();
    const segunda = leituras.nova();
    assert.equal(leituras.vale(primeira), false, "a anterior fica obsoleta");
    assert.equal(leituras.vale(segunda), true);
    const terceira = leituras.nova();
    assert.equal(leituras.vale(segunda), false);
    assert.equal(leituras.vale(terceira), true);
  });
});

const NS = "http://www.portalfiscal.inf.br/nfe";
const raiz = (declaracoes: string, dentro: string) => `<nfeProc xmlns="${NS}"${declaracoes}><NFe><infNFe>${dentro}<ide><nNF>7</nNF></ide></infNFe></NFe></nfeProc>`;

describe("custo e limites do analisador de XML (PLU-361)", () => {
  it("XML patológico de ~1,5 MB (namespaces na raiz e centenas de milhares de tags vazias) é recusado em tempo curto", () => {
    const declaracoes = Array.from({ length: 100 }, (_, i) => ` xmlns:n${i}="urn:exemplo:${i}"`).join("");
    const xml = raiz(declaracoes, "<x/>".repeat(400_000));
    const t0 = performance.now();
    assert.equal(dadosDaNfe(xml), null);
    assert.ok(performance.now() - t0 < 500, "a leitura precisa terminar em menos de 500 ms");
  });

  it("muitos namespaces com muitas tags também termina rápido", () => {
    const declaracoes = Array.from({ length: 3000 }, (_, i) => ` xmlns:n${i}="urn:exemplo:${i}"`).join("");
    const t0 = performance.now();
    assert.equal(dadosDaNfe(raiz(declaracoes, "<x/>".repeat(300_000))), null);
    assert.ok(performance.now() - t0 < 500);
  });

  it("os tetos: elementos, atributos por elemento e declarações de namespace", () => {
    assert.deepEqual(LIMITES_DO_XML, { elementos: 20_000, atributosPorElemento: 50, declaracoesDeNamespace: 100 });
    // dentro do teto lê; um a mais recusa
    assert.equal(dadosDaNfe(raiz("", "<x/>".repeat(LIMITES_DO_XML.elementos - 6)))?.numero, "7");
    assert.equal(dadosDaNfe(raiz("", "<x/>".repeat(LIMITES_DO_XML.elementos)))?.numero ?? null, null);
    const atributos = (n: number) => Array.from({ length: n }, (_, i) => ` a${i}="1"`).join("");
    assert.equal(dadosDaNfe(raiz("", `<x${atributos(LIMITES_DO_XML.atributosPorElemento)}/>`))?.numero, "7");
    assert.equal(dadosDaNfe(raiz("", `<x${atributos(LIMITES_DO_XML.atributosPorElemento + 1)}/>`)), null);
    const declaracoes = (n: number) => Array.from({ length: n }, (_, i) => ` xmlns:n${i}="urn:${i}"`).join("");
    assert.equal(dadosDaNfe(raiz("", `<x${declaracoes(40)}/><y${declaracoes(40)}/>`))?.numero, "7");
    assert.equal(dadosDaNfe(raiz("", `<x${declaracoes(40)}/><y${declaracoes(40)}/><z${declaracoes(40)}/>`)), null, "o total de declarações passa de 100");
  });

  it("a tag que não declara namespace reaproveita o escopo do pai (o mapa só é copiado quando há declaração nova)", () => {
    const declaracoes = Array.from({ length: 45 }, (_, i) => ` xmlns:n${i}="urn:exemplo:${i}"`).join("");
    const t0 = performance.now();
    assert.equal(dadosDaNfe(raiz(declaracoes, "<x/>".repeat(15_000)))?.numero, "7");
    assert.ok(performance.now() - t0 < 300);
  });
});

describe("rigor do analisador de XML (PLU-361)", () => {
  it("recusa atributo duplicado no mesmo elemento", () => {
    assert.equal(dadosDaNfe(raiz("", '<x a="1" a="2"/>')), null);
    assert.equal(dadosDaNfe(raiz("", '<x a="1" b="2"/>'))?.numero, "7");
  });

  it("valida as entidades também nos atributos", () => {
    assert.equal(dadosDaNfe(raiz("", '<x a="&desconhecida;"/>')), null);
    assert.equal(dadosDaNfe(raiz("", '<x a="&amp;"/>'))?.numero, "7");
    assert.equal(dadosDaNfe(raiz("", '<x a="solto & solto"/>')), null);
  });

  it("entidades pelo nome próprio, sem protótipo: &constructor; e &__proto__; não valem", () => {
    assert.equal(dadosDaNfe(nfe({ emitente: "A &constructor; B" })), null);
    assert.equal(dadosDaNfe(nfe({ emitente: "A &__proto__; B" })), null);
    assert.equal(dadosDaNfe(nfe({ emitente: "A &toString; B" })), null);
    assert.equal(dadosDaNfe(nfe({ emitente: "A &amp; B" }))?.emitente, "A & B");
  });

  it("o infNFe só vale no caminho nfeProc/NFe/infNFe ou NFe/infNFe", () => {
    const inf = `<infNFe><ide><nNF>3</nNF></ide></infNFe>`;
    assert.equal(dadosDaNfe(`<nfeProc xmlns="${NS}"><NFe>${inf}</NFe></nfeProc>`)?.numero, "3");
    assert.equal(dadosDaNfe(`<NFe xmlns="${NS}">${inf}</NFe>`)?.numero, "3");
    assert.equal(dadosDaNfe(`<outra xmlns="${NS}"><NFe>${inf}</NFe></outra>`), null, "raiz que não é nfeProc nem NFe");
    assert.equal(dadosDaNfe(`<nfeProc xmlns="${NS}"><x><NFe>${inf}</NFe></x></nfeProc>`), null, "NFe fora do lugar");
    assert.equal(dadosDaNfe(`<nfeProc xmlns="${NS}">${inf}</nfeProc>`), null, "infNFe direto na raiz");
    assert.equal(dadosDaNfe(`<nfeProc xmlns="${NS}"><NFe><x>${inf}</x></NFe></nfeProc>`), null, "infNFe dentro de outro elemento");
  });
});
