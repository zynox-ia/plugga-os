import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const roda = (...args) =>
  spawnSync(process.execPath, ["scripts/executa-ou-pendente.mjs", ...args], { encoding: "utf8" });

test("arquivo inexistente falha dizendo qual tarefa o cria", () => {
  const r = roda("T999", "scripts/nao-existe.mjs");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /T999/);
  assert.match(r.stderr, /nao-existe\.mjs/);
});

test("arquivo existente é executado e o código de saída é repassado", () => {
  assert.equal(roda("T000", "scripts/verifica-eventlog.mjs").status, 0);
});

test("sem argumentos é erro de uso", () => {
  assert.equal(roda().status, 2);
});
