import assert from "node:assert/strict";
import { test } from "node:test";

import { lancamentosDoRelatorioQuerySchema, relatorioPorCategoriaQuerySchema } from "../dist/relatorios-do-financeiro.js";

const ID = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";
const OUTRO = "7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

test("o período do relatório é de qualquer dia a qualquer dia, com o fim depois do início (PLU-360)", () => {
  assert.deepEqual(relatorioPorCategoriaQuerySchema.parse({ de: "2026-11-01", ate: "2026-11-30" }), { de: "2026-11-01", ate: "2026-11-30" });
  assert.equal(relatorioPorCategoriaQuerySchema.safeParse({ de: "2026-11-27", ate: "2026-11-27", empresa: "waze" }).success, true);
  const invertido = relatorioPorCategoriaQuerySchema.safeParse({ de: "2026-11-30", ate: "2026-11-01" });
  assert.equal(invertido.success, false);
  assert.equal(invertido.error?.issues[0]?.message, "O fim do período vem depois do início.");
  assert.equal(relatorioPorCategoriaQuerySchema.safeParse({ de: "2026-02-30", ate: "2026-03-01" }).success, false);
  assert.equal(relatorioPorCategoriaQuerySchema.safeParse({ de: "2026-11-01", ate: "2026-11-30", empresa: "outra" }).success, false);
  assert.equal(relatorioPorCategoriaQuerySchema.safeParse({ de: "2026-11-01", ate: "2026-11-30", extra: "1" }).success, false);
});

test("os lançamentos de uma linha vêm pelos ids da linha ou por 'sem' (PLU-360)", () => {
  assert.deepEqual(lancamentosDoRelatorioQuerySchema.parse({ de: "2026-11-01", ate: "2026-11-30", tipo: "saida", categoria: `${ID},${OUTRO}` }).categoria, [ID, OUTRO]);
  assert.equal(lancamentosDoRelatorioQuerySchema.parse({ de: "2026-11-01", ate: "2026-11-30", tipo: "entrada", categoria: "sem" }).categoria, "sem");
  for (const categoria of ["", "x", `${ID},`, "Sem"]) {
    assert.equal(lancamentosDoRelatorioQuerySchema.safeParse({ de: "2026-11-01", ate: "2026-11-30", tipo: "saida", categoria }).success, false, categoria);
  }
  assert.equal(lancamentosDoRelatorioQuerySchema.safeParse({ de: "2026-11-01", ate: "2026-11-30", tipo: "todos", categoria: ID }).success, false);
});
