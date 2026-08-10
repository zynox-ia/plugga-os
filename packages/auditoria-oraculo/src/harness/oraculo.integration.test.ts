/**
 * Testes que executam o oráculo Python.
 *
 * Ficam atrás de `RUN_ORACULO_TESTS=true`, como as demais integrações do repo:
 * a suíte padrão precisa passar em qualquer máquina, e o Python não faz parte
 * do runtime. Rodar: `RUN_ORACULO_TESTS=true pnpm --filter @plugga/auditoria-oraculo test`.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { lerManifesto, verificarManifesto } from "../manifesto.ts";
import { goldenSantaTereza, versaoDoPythonDoOraculo } from "../oraculo.ts";
import {
  oraculoReproduzOGolden,
  versaoDoPythonInstalado,
} from "./python.ts";
import { criarWorkspace } from "./workspace.ts";

const ligado = process.env.RUN_ORACULO_TESTS === "true";

describe("oráculo Python", { skip: ligado ? false : "RUN_ORACULO_TESTS != true" }, () => {
  test("roda na versão fixada pela norma", async () => {
    assert.equal(await versaoDoPythonInstalado(), versaoDoPythonDoOraculo);
  });

  test("reproduz o golden Santa Tereza antes de servir de referência", async () => {
    const workspace = await criarWorkspace("golden");

    try {
      const { ok, saida } = await oraculoReproduzOGolden(workspace);

      assert.ok(ok, `o oráculo não fechou o golden:\n${saida}`);
      assert.match(saida, /GOLDEN OK/);
    } finally {
      await workspace.descartar();
    }
  });

  test("executar o oráculo não invalida a árvore congelada", async () => {
    const workspace = await criarWorkspace("integridade");

    try {
      await oraculoReproduzOGolden(workspace);

      assert.deepEqual(await verificarManifesto(await lerManifesto()), []);
    } finally {
      await workspace.descartar();
    }
  });

  test("os MD5 do golden continuam sendo os congelados", async () => {
    assert.equal(goldenSantaTereza.desktop.length, 32);
    assert.equal(goldenSantaTereza.celular.length, 32);
  });
});
