import assert from "node:assert/strict";
import { it } from "node:test";

import { calcularProbabilidadeEtapa, calcularValorPonderado } from "../app/lib/negocios/probabilidade-etapa.ts";

it("estima probabilidade pela posição sem atribuir 100% a uma etapa existente", () => {
  assert.equal(calcularProbabilidadeEtapa(0, 3), 0.25);
  assert.equal(calcularProbabilidadeEtapa(2, 3), 0.75);
  assert.equal(calcularProbabilidadeEtapa(-1, 3), 0);
  assert.equal(calcularProbabilidadeEtapa(0, 0), 0);
});

it("calcula o valor ponderado pela probabilidade estimada", () => {
  assert.equal(calcularValorPonderado(200_000, 1, 3), 100_000);
});
