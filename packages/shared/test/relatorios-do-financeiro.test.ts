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

test("o período fica entre 2000-01-01 e 2100-12-31, nos dois relatórios, com mensagem clara (PLU-360)", () => {
  for (const schema of [relatorioPorCategoriaQuerySchema, lancamentosDoRelatorioQuerySchema]) {
    const extra = schema === lancamentosDoRelatorioQuerySchema ? { tipo: "saida", categoria: "sem" } : {};
    assert.equal(schema.safeParse({ de: "2000-01-01", ate: "2100-12-31", ...extra }).success, true);
    for (const [de, ate] of [["1999-12-31", "2026-11-30"], ["2026-11-01", "2101-01-01"], ["9999-12-31", "9999-12-31"], ["0001-01-01", "0001-01-01"]]) {
      const r = schema.safeParse({ de, ate, ...extra });
      assert.equal(r.success, false, `${de} a ${ate}`);
      assert.ok(r.error?.issues.some((i) => i.message === "Escolha um dia entre 01/01/2000 e 31/12/2100."), `${de} a ${ate}`);
    }
  }
});
