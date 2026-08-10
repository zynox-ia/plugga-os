import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, test } from "node:test";

import { caminhosDoOraculo, raizDaReferencia } from "../oraculo.ts";
import { criarWorkspace, hashDoBundle } from "./workspace.ts";

async function existe(caminho: string): Promise<boolean> {
  try {
    await access(caminho);
    return true;
  } catch {
    return false;
  }
}

describe("workspace isolado por execução", () => {
  test("traz a skill inteira, com assets, casos e templates", async () => {
    const workspace = await criarWorkspace("copia");

    try {
      for (const relativo of ["assets", "casos", "templates"]) {
        assert.ok(
          await existe(path.join(workspace.skill, relativo)),
          `faltou ${relativo}`,
        );
      }
      assert.ok(
        await existe(path.join(workspace.skill, "assets", "motor_bess_solar.py")),
      );
    } finally {
      await workspace.descartar();
    }
  });

  test("duas execuções concorrentes não compartilham arquivos", async () => {
    const [a, b] = await Promise.all([criarWorkspace("a"), criarWorkspace("b")]);

    try {
      assert.notEqual(a.raiz, b.raiz);
      await writeFile(path.join(a.saidaPython, "fluxo.json"), "{}", "utf8");

      assert.ok(await existe(path.join(a.saidaPython, "fluxo.json")));
      assert.equal(await existe(path.join(b.saidaPython, "fluxo.json")), false);
    } finally {
      await Promise.all([a.descartar(), b.descartar()]);
    }
  });

  test("escrever no workspace não toca a árvore congelada", async () => {
    const modelo = path.join(raizDaReferencia, caminhosDoOraculo.modeloOficial);
    const antes = await readFile(modelo, "utf8");
    const workspace = await criarWorkspace("congelada");

    try {
      const copia = path.join(workspace.raiz, caminhosDoOraculo.modeloOficial);
      await writeFile(copia, "adulterado", "utf8");

      assert.equal(await readFile(modelo, "utf8"), antes);
      assert.notEqual(workspace.raiz, raizDaReferencia);
    } finally {
      await workspace.descartar();
    }
  });

  test("é limpo ao final", async () => {
    const workspace = await criarWorkspace("limpeza");
    await workspace.descartar();

    assert.equal(await existe(workspace.raiz), false);
  });
});

describe("hash do bundle de entrada", () => {
  test("mesma entrada dos dois lados dá o mesmo hash", async () => {
    const a = await criarWorkspace("hash-a");
    const b = await criarWorkspace("hash-b");

    try {
      for (const workspace of [a, b]) {
        await writeFile(
          path.join(workspace.entrada, "caso.json"),
          '{"n_bess":4}',
          "utf8",
        );
      }

      assert.equal(await hashDoBundle(a.entrada), await hashDoBundle(b.entrada));
    } finally {
      await Promise.all([a.descartar(), b.descartar()]);
    }
  });

  test("um byte diferente muda o hash", async () => {
    const workspace = await criarWorkspace("hash-mudanca");

    try {
      const caso = path.join(workspace.entrada, "caso.json");
      await writeFile(caso, '{"n_bess":4}', "utf8");
      const antes = await hashDoBundle(workspace.entrada);
      await writeFile(caso, '{"n_bess":5}', "utf8");

      assert.notEqual(await hashDoBundle(workspace.entrada), antes);
    } finally {
      await workspace.descartar();
    }
  });
});
