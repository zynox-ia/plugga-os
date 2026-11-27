import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { atalhosDeMes, escolhaDoPeriodo, LIMITE_DE_DIAS_DA_CONCILIACAO } from "../app/lib/periodo-por-atalho.ts";

const rotulo = (mes: string) => `m ${mes}`;

describe("atalhos de mês do filtro de período", () => {
  it("o mês de hoje vai até hoje; os anteriores, até o último dia (inclusive fevereiro de ano bissexto)", () => {
    const atalhos = atalhosDeMes("2028-03-10", 3, rotulo);
    assert.deepEqual(atalhos.map((a) => [a.value, a.label, a.de, a.ate]), [
      ["2028-03", "m 2028-03", "2028-03-01", "2028-03-10"],
      ["2028-02", "m 2028-02", "2028-02-01", "2028-02-29"],
      ["2028-01", "m 2028-01", "2028-01-01", "2028-01-31"],
    ]);
  });
  it("atravessa a virada do ano", () => {
    assert.deepEqual(atalhosDeMes("2026-01-05", 2, rotulo).map((a) => a.value), ["2026-01", "2025-12"]);
  });
});

describe("o intervalo do endereço é atalho ou personalizado, nunca os dois", () => {
  const atalhos = atalhosDeMes("2026-11-15", 3, rotulo);
  it("o mês exato de um atalho vira o atalho", () => {
    assert.deepEqual(escolhaDoPeriodo("2026-10-01", "2026-10-31", atalhos), { atalho: "2026-10", intervalo: null });
    assert.deepEqual(escolhaDoPeriodo("2026-11-01", "2026-11-15", atalhos), { atalho: "2026-11", intervalo: null });
  });
  it("qualquer outro intervalo é personalizado, mesmo dentro de um mês dos atalhos", () => {
    assert.deepEqual(escolhaDoPeriodo("2026-11-01", "2026-11-10", atalhos), { atalho: "", intervalo: { de: "2026-11-01", ate: "2026-11-10" } });
    assert.deepEqual(escolhaDoPeriodo("2026-11-01", "2026-11-30", atalhos), { atalho: "", intervalo: { de: "2026-11-01", ate: "2026-11-30" } });
    assert.deepEqual(escolhaDoPeriodo("2024-03-01", "2024-03-31", atalhos), { atalho: "", intervalo: { de: "2024-03-01", ate: "2024-03-31" } });
  });
});

describe("limite da API", () => {
  it("é de 366 dias, como a API de Conciliação", () => {
    assert.equal(LIMITE_DE_DIAS_DA_CONCILIACAO, 366);
  });
});
