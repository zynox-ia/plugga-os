import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RelatorioPorCategoria } from "@plugga/shared";

import {
  atalhoDoPeriodo,
  consultaDosLancamentosDaLinha,
  csvDoRelatorio,
  decimalNoCsv,
  hrefDoRelatorio,
  lerFiltrosDoRelatorio,
  nomeDoCsv,
  periodoDoAtalho,
  resultadoDoRelatorio,
  rotuloDoPeriodo,
} from "../app/lib/relatorios-do-financeiro.ts";

const HOJE = "2026-11-27";
const ID = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const OUTRO = "7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const relatorio: RelatorioPorCategoria = {
  de: "2026-11-01",
  ate: "2026-11-30",
  empresa: null,
  entradas: { total: "1000.00", quantidade: 2, grupos: [{ chave: "1.01|Receitas", codigo: "1.01", nome: "Receitas", total: "1000.00", quantidade: 2, percentual: "100.0", categorias: [{ chave: "1.01.01|Gestão", codigo: "1.01.01", nome: "Gestão", categorias: [ID], total: "1000.00", quantidade: 2, percentual: "100.0" }] }] },
  saidas: {
    total: "1200.50",
    quantidade: 3,
    grupos: [
      { chave: "2.04|Impostos; taxas", codigo: "2.04", nome: "Impostos; taxas", total: "1200.00", quantidade: 2, percentual: "100.0", categorias: [{ chave: "2.04.01|ISS \"municipal\"", codigo: "2.04.01", nome: "ISS \"municipal\"", categorias: [ID, OUTRO], total: "1200.00", quantidade: 2, percentual: "100.0" }] },
      { chave: "sem", codigo: null, nome: "Sem categoria", total: "0.50", quantidade: 1, percentual: "0.0", categorias: [{ chave: "sem", codigo: null, nome: "Sem categoria", categorias: [], total: "0.50", quantidade: 1, percentual: "0.0" }] },
    ],
  },
  resultado: "-200.50",
};

describe("período do relatório (PLU-360)", () => {
  it("os atalhos: o mês atual inteiro, o anterior (com a virada do ano) e o ano", () => {
    assert.deepEqual(periodoDoAtalho("mes", HOJE), { de: "2026-11-01", ate: "2026-11-30" });
    assert.deepEqual(periodoDoAtalho("anterior", HOJE), { de: "2026-10-01", ate: "2026-10-31" });
    assert.deepEqual(periodoDoAtalho("anterior", "2027-01-05"), { de: "2026-12-01", ate: "2026-12-31" });
    assert.deepEqual(periodoDoAtalho("mes", "2028-02-10"), { de: "2028-02-01", ate: "2028-02-29" });
    assert.deepEqual(periodoDoAtalho("ano", HOJE), { de: "2026-01-01", ate: "2026-12-31" });
    assert.equal(atalhoDoPeriodo({ de: "2026-10-01", ate: "2026-10-31" }, HOJE), "anterior");
    assert.equal(atalhoDoPeriodo({ de: "2026-11-03", ate: "2026-11-20" }, HOJE), null);
  });

  it("a URL vale com dias válidos e em ordem; senão, o mês atual. A empresa só se for uma das duas", () => {
    assert.deepEqual(lerFiltrosDoRelatorio({}, HOJE), { de: "2026-11-01", ate: "2026-11-30" });
    assert.deepEqual(lerFiltrosDoRelatorio({ de: "2026-03-05", ate: "2026-03-05", empresa: "waze" }, HOJE), { de: "2026-03-05", ate: "2026-03-05", empresa: "waze" });
    for (const p of [{ de: "2026-11-30", ate: "2026-11-01" }, { de: "2026-02-30", ate: "2026-03-01" }, { de: "2026-11-01" }, { de: "ontem", ate: "hoje" }]) {
      assert.deepEqual(lerFiltrosDoRelatorio(p, HOJE), { de: "2026-11-01", ate: "2026-11-30" }, JSON.stringify(p));
    }
    assert.equal(lerFiltrosDoRelatorio({ empresa: "outra" }, HOJE).empresa, undefined);
    assert.equal(hrefDoRelatorio({ de: "2026-11-01", ate: "2026-11-30", empresa: "plugga" }), "/financeiro/relatorios?de=2026-11-01&ate=2026-11-30&empresa=plugga");
  });

  it("rótulo do período e a consulta dos lançamentos de uma linha (ids da linha ou 'sem')", () => {
    assert.equal(rotuloDoPeriodo("2026-11-01", "2026-11-30"), "01/11/2026 a 30/11/2026");
    assert.equal(rotuloDoPeriodo("2026-11-27", "2026-11-27"), "27/11/2026");
    const filtros = { de: "2026-11-01", ate: "2026-11-30", empresa: "waze" as const };
    assert.equal(consultaDosLancamentosDaLinha(filtros, "saida", [ID, OUTRO]), `de=2026-11-01&ate=2026-11-30&empresa=waze&tipo=saida&categoria=${ID}%2C${OUTRO}`);
    assert.equal(consultaDosLancamentosDaLinha({ de: "2026-11-01", ate: "2026-11-30" }, "entrada", []), "de=2026-11-01&ate=2026-11-30&tipo=entrada&categoria=sem");
  });
});

describe("resultado do relatório (PLU-360)", () => {
  it("inteiro com os dois lados; parcial, sem número, quando a sessão vê só um", () => {
    assert.deepEqual(resultadoDoRelatorio(relatorio), { tipo: "inteiro", valor: "-200.50" });
    const soSaidas = resultadoDoRelatorio({ ...relatorio, entradas: null, resultado: null });
    assert.equal(soSaidas.tipo, "parcial");
    assert.match(soSaidas.tipo === "parcial" ? soSaidas.texto : "", /só as saídas.*Contas a receber/);
    const soEntradas = resultadoDoRelatorio({ ...relatorio, saidas: null, resultado: null });
    assert.match(soEntradas.tipo === "parcial" ? soEntradas.texto : "", /só as entradas.*Contas a pagar/);
    // Mesmo que um resultado chegasse sem um dos lados, a tela não o mostra como inteiro.
    assert.equal(resultadoDoRelatorio({ ...relatorio, entradas: null }).tipo, "parcial");
    assert.equal(resultadoDoRelatorio({ entradas: null, saidas: null, resultado: null }).tipo, "parcial");
  });
});

describe("CSV do relatório (PLU-360)", () => {
  it("decimal com vírgula, sem passar por número", () => {
    assert.equal(decimalNoCsv("1234.56"), "1234,56");
    assert.equal(decimalNoCsv("-200.5"), "-200,50");
    assert.equal(decimalNoCsv("12.5"), "12,50");
    assert.equal(decimalNoCsv("7"), "7,00");
  });

  it("BOM, ';' entre colunas, grupo e categoria em linhas, total por seção e o resultado; aspas onde precisa", () => {
    const csv = csvDoRelatorio(relatorio);
    assert.ok(csv.startsWith(String.fromCharCode(0xfeff)));
    const linhas = csv.slice(1).split("\r\n");
    assert.equal(linhas[1], "Período;01/11/2026 a 30/11/2026");
    assert.equal(linhas[2], "Empresa;Plugga e Waze Energia");
    assert.equal(linhas[5], "Seção;Nível;Grupo;Código;Categoria;Lançamentos;Total (R$);% da seção");
    assert.ok(linhas.includes("Entradas;Grupo;Receitas;1.01;;2;1000,00;100,0"));
    assert.ok(linhas.includes("Entradas;Categoria;Receitas;1.01.01;Gestão;2;1000,00;100,0"));
    assert.ok(linhas.includes("Saídas;Categoria;\"Impostos; taxas\";2.04.01;\"ISS \"\"municipal\"\"\";2;1200,00;100,0"));
    assert.ok(linhas.includes("Saídas;Categoria;Sem categoria;;Sem categoria;1;0,50;0,0"));
    assert.ok(linhas.includes("Saídas;Total;;;;3;1200,50;100,0"));
    assert.ok(linhas.includes("Resultado;-200,50"));
    assert.equal(csv.endsWith("\r\n"), true);
  });

  it("texto livre que a planilha leria como fórmula vira texto; os valores, mesmo negativos, seguem como número", () => {
    const perigosos = ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\tTab", "\rRetorno"];
    const grupos = perigosos.map((nome, i) => ({
      chave: `g${i}`, codigo: `2.0${i}`, nome, total: "1.00", quantidade: 1, percentual: "10.0",
      categorias: [{ chave: `c${i}`, codigo: `2.0${i}.01`, nome, categorias: [ID], total: "1.00", quantidade: 1, percentual: "10.0" }],
    }));
    const csv = csvDoRelatorio({ ...relatorio, saidas: { total: "6.00", quantidade: 6, grupos } });
    const linhas = csv.slice(1).split("\r\n");
    assert.ok(linhas.includes("Saídas;Grupo;\"'=HYPERLINK(\"\"http://x\"\")\";2.00;;1;1,00;10,0"));
    assert.ok(linhas.includes("Saídas;Categoria;\"'+1+1\";2.01.01;\"'+1+1\";1;1,00;10,0"));
    assert.ok(linhas.includes("Saídas;Grupo;\"'-2+3\";2.02;;1;1,00;10,0"));
    assert.ok(linhas.includes("Saídas;Grupo;\"'@SUM(A1)\";2.03;;1;1,00;10,0"));
    assert.ok(csv.includes("Saídas;Grupo;\"'\tTab\";2.04;"));
    assert.ok(csv.includes("Saídas;Grupo;\"'\rRetorno\";2.05;"));
    // Nenhuma célula de texto começa crua por um prefixo de fórmula.
    for (const linha of linhas) for (const c of linha.split(";")) assert.ok(!/^[=+@\t\r]/.test(c) || c.startsWith("\"'"), c);
    // O resultado negativo é número, não texto neutralizado.
    assert.ok(linhas.includes("Resultado;-200,50"));
  });

  it("a seção sem acesso aparece como tal e o resultado diz que é parcial; o nome do arquivo leva o período e a empresa", () => {
    const csv = csvDoRelatorio({ ...relatorio, entradas: null, resultado: null, empresa: "waze" });
    assert.ok(csv.includes("Entradas;Sem acesso;;;Falta a tela Contas a receber;;;"));
    assert.ok(csv.includes("Resultado;Parcial: você vê só as saídas."));
    assert.ok(!csv.includes("-200,50"));
    assert.equal(nomeDoCsv({ de: "2026-11-01", ate: "2026-11-30", empresa: null }), "relatorio-por-categoria_2026-11-01_a_2026-11-30_todas.csv");
    assert.equal(nomeDoCsv({ de: "2026-11-01", ate: "2026-11-30", empresa: "waze" }), "relatorio-por-categoria_2026-11-01_a_2026-11-30_waze.csv");
  });
});
