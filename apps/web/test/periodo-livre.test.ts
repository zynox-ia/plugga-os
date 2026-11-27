import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dentroDoIntervalo, escreverIntervaloNaUrl, lerIntervalo, rotuloDoIntervalo, validarIntervalo } from "../app/lib/periodo-livre.ts";

describe("intervalo livre de datas: leitura do endereço", () => {
  it("lê de e ate quando as duas datas existem e estão em ordem", () => {
    assert.deepEqual(lerIntervalo("2026-11-01", "2026-11-15"), { de: "2026-11-01", ate: "2026-11-15" });
    assert.deepEqual(lerIntervalo("2026-11-15", "2026-11-15"), { de: "2026-11-15", ate: "2026-11-15" });
  });
  it("ignora datas ausentes, mal escritas, inexistentes ou invertidas: o filtro volta ao padrão", () => {
    assert.equal(lerIntervalo(undefined, undefined), null);
    assert.equal(lerIntervalo("2026-11-01", undefined), null);
    assert.equal(lerIntervalo(null, "2026-11-15"), null);
    assert.equal(lerIntervalo("01/11/2026", "15/11/2026"), null);
    assert.equal(lerIntervalo("2026-02-30", "2026-03-10"), null);
    assert.equal(lerIntervalo("2026-13-01", "2026-13-02"), null);
    assert.equal(lerIntervalo("2026-11-16", "2026-11-15"), null);
    assert.equal(lerIntervalo("2026-11-01 ", "2026-11-15"), null);
  });
  it("escreve de e ate no endereço sem tocar nos outros parâmetros, e remove os dois ao limpar", () => {
    const url = new URL("http://localhost/financeiro/notas-fiscais?lado=saidas");
    escreverIntervaloNaUrl(url, { de: "2026-11-01", ate: "2026-11-15" });
    assert.equal(url.search, "?lado=saidas&de=2026-11-01&ate=2026-11-15");
    escreverIntervaloNaUrl(url, { de: "2026-10-01", ate: "2026-10-31" });
    assert.equal(url.search, "?lado=saidas&de=2026-10-01&ate=2026-10-31");
    escreverIntervaloNaUrl(url, null);
    assert.equal(url.search, "?lado=saidas");
  });
});

describe("intervalo livre de datas: validação do formulário", () => {
  it("exige as duas datas", () => {
    assert.deepEqual(validarIntervalo("", ""), { de: "Informe a data inicial.", ate: "Informe a data final." });
    assert.deepEqual(validarIntervalo("2026-11-01", ""), { ate: "Informe a data final." });
    assert.deepEqual(validarIntervalo("", "2026-11-15"), { de: "Informe a data inicial." });
  });
  it("a data final não pode ser anterior à inicial, e o erro fica no campo Até", () => {
    assert.deepEqual(validarIntervalo("2026-11-16", "2026-11-15"), { ate: "A data final não pode ser anterior à inicial." });
  });
  it("recusa datas que não existem", () => {
    assert.deepEqual(validarIntervalo("2026-02-30", "2026-03-01"), { de: "Informe uma data válida." });
  });
  it("aceita datas em ordem, inclusive o mesmo dia", () => {
    assert.deepEqual(validarIntervalo("2026-11-01", "2026-11-15"), {});
    assert.deepEqual(validarIntervalo("2026-11-15", "2026-11-15"), {});
  });
});

describe("intervalo livre de datas: rótulo curto", () => {
  it("no mesmo ano, o ano aparece só no fim", () => {
    assert.equal(rotuloDoIntervalo({ de: "2026-11-01", ate: "2026-11-15" }), "01/11 – 15/11/2026");
  });
  it("em anos diferentes, os dois anos aparecem", () => {
    assert.equal(rotuloDoIntervalo({ de: "2025-12-20", ate: "2026-01-10" }), "20/12/2025 – 10/01/2026");
  });
  it("um dia só vira uma data só", () => {
    assert.equal(rotuloDoIntervalo({ de: "2026-11-15", ate: "2026-11-15" }), "15/11/2026");
  });
});

describe("intervalo livre de datas: o dia entra pela data, com o dia inteiro do Até", () => {
  const i = { de: "2026-11-01", ate: "2026-11-15" };
  it("inclui os dois extremos", () => {
    assert.equal(dentroDoIntervalo("2026-11-01", i), true);
    assert.equal(dentroDoIntervalo("2026-11-15", i), true);
  });
  it("exclui o dia antes e o dia depois", () => {
    assert.equal(dentroDoIntervalo("2026-10-31", i), false);
    assert.equal(dentroDoIntervalo("2026-11-16", i), false);
  });
  it("com hora, vale o dia: 23:59:59 do último dia ainda entra", () => {
    assert.equal(dentroDoIntervalo("2026-11-15T23:59:59", i), true);
    assert.equal(dentroDoIntervalo("2026-11-16T00:00:00", i), false);
  });
  it("sem intervalo, tudo entra", () => {
    assert.equal(dentroDoIntervalo("2020-01-01", null), true);
  });
});
