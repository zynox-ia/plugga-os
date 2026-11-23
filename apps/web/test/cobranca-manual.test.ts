import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TEMPO_MAXIMO_MS } from "../app/lib/api-core.ts";
import { categoriasDaEntrada, cobrancaExistente, cobrancaVazia, competenciasParaEscolher, corpoDaCobranca, descricaoSugerida, hrefDoZip, mesesParaBaixar, PRAZO_DO_ZIP_MS, tiposDoZip } from "../app/lib/cobranca-manual.ts";

const u = (n: number) => `6f1c2a3b-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("nova cobrança manual", () => {
  it("a competência sugerida é a do mês anterior, que vem primeiro na lista", () => {
    assert.equal(cobrancaVazia("2026-01-15").competencia, "2025-12");
    assert.deepEqual(competenciasParaEscolher("2026-01-15").map((c) => c.value), ["2025-12", "2026-01", "2025-11", "2025-10"]);
  });

  it("aponta cada campo que falta, com o nome do campo da API", () => {
    const { corpo, porCampo } = corpoDaCobranca({ ...cobrancaVazia("2026-11-24"), competencia: "" });
    assert.equal(corpo, undefined);
    assert.deepEqual(Object.keys(porCampo).sort(), ["categoriaId", "clientId", "competencia", "descricao", "empresa", "valor", "vencimento"]);
    assert.equal(porCampo.categoriaId, "escolha a empresa primeiro.");
  });

  it("monta o corpo com o valor em decimal, as UCs e sem conta nem observação vazias", () => {
    const campos = { ...cobrancaVazia("2026-11-24"), empresa: "plugga" as const, clientId: u(1), categoriaId: u(2), descricao: " Gestão de energia · out/2026 ", valor: "2.640,00", vencimento: "2026-12-05", ucIds: [u(3)] };
    assert.deepEqual(corpoDaCobranca(campos).corpo, { empresa: "plugga", clientId: u(1), competencia: "2026-10", categoriaId: u(2), descricao: "Gestão de energia · out/2026", valor: "2640.00", vencimento: "2026-12-05", ucIds: [u(3)] });
    assert.equal(corpoDaCobranca({ ...campos, contaCorrenteId: u(4), observacao: "x" }).corpo?.contaCorrenteId, u(4));
  });

  it("a repetida (409) traz a existente em `existente`; sem ela, não há o que abrir", () => {
    const envelope = { codigo: "CONFLITO_UNICIDADE", mensagem: "Já existe a CR-0012 deste cliente nesta competência.", detalhes: [{ campo: "competencia", problema: "Uma cobrança por cliente e competência." }], existente: { codigo: "CR-0012", id: u(9) } };
    assert.deepEqual(cobrancaExistente(envelope), { codigo: "CR-0012", id: u(9) });
    assert.equal(cobrancaExistente({ codigo: "CONFLITO_UNICIDADE", mensagem: "Já existe a CR-0012 deste cliente nesta competência.", id: u(9) }), null);
    assert.equal(cobrancaExistente({ existente: { codigo: "CR-0012" } }), null);
    assert.equal(cobrancaExistente(null), null);
  });

  it("só categorias de receita ativas da empresa, e a descrição sugerida", () => {
    const cat = (n: number, empresa: "plugga" | "waze", tipo: "receita" | "despesa", ativa: boolean, codigo: string) => ({ id: u(n), empresa, codigo, nome: codigo, tipo, natureza: "outros" as const, grupo: { codigo: "1.01", nome: "G" }, ativa });
    const opcoes = { categorias: [cat(1, "plugga", "receita", true, "1.10"), cat(2, "plugga", "receita", true, "1.9"), cat(3, "plugga", "despesa", true, "2.01"), cat(4, "waze", "receita", true, "1.01"), cat(5, "plugga", "receita", false, "1.05")] };
    assert.deepEqual(categoriasDaEntrada(opcoes, "plugga").map((c) => c.codigo), ["1.9", "1.10"]);
    assert.deepEqual(categoriasDaEntrada(opcoes, null), []);
    assert.equal(descricaoSugerida("Gestão de energia", "2026-10"), "Gestão de energia · out/2026");
  });
});

describe("baixar comprovantes", () => {
  it("o mês atual vai até hoje; os anteriores, até o último dia", () => {
    const meses = mesesParaBaixar("2026-03-10", 3);
    assert.deepEqual(meses.map((m) => [m.value, m.de, m.ate]), [["2026-03", "2026-03-01", "2026-03-10"], ["2026-02", "2026-02-01", "2026-02-28"], ["2026-01", "2026-01-01", "2026-01-31"]]);
  });

  it("o endereço leva só o que foi escolhido", () => {
    assert.equal(hrefDoZip({ empresa: null, de: "2026-11-01", ate: "2026-11-30", tipo: "todos" }), "/api/financeiro/comprovantes.zip?de=2026-11-01&ate=2026-11-30");
    assert.equal(hrefDoZip({ empresa: "waze", de: "2026-11-01", ate: "2026-11-30", tipo: "saida" }), "/api/financeiro/comprovantes.zip?empresa=waze&de=2026-11-01&ate=2026-11-30&tipo=saida");
  });

  it("o proxy do .zip espera bem mais que o padrão, para não cortar o arquivo no meio", () => {
    assert.ok(PRAZO_DO_ZIP_MS >= 10 * TEMPO_MAXIMO_MS);
  });

  it("só os tipos que a pessoa alcança", () => {
    assert.equal(tiposDoZip({ saidas: true, entradas: true }).length, 3);
    assert.deepEqual(tiposDoZip({ saidas: true, entradas: false }).map((t) => t.value), ["saida"]);
    assert.deepEqual(tiposDoZip({ saidas: false, entradas: true }).map((t) => t.value), ["entrada"]);
  });
});
