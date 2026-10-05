import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { verificar } from "./verifica-rede-externa.mjs";

function projeto(arquivos) {
  const dir = mkdtempSync(path.join(tmpdir(), "rede-"));
  for (const [relativo, conteudo] of Object.entries(arquivos)) {
    const alvo = path.join(dir, relativo);
    mkdirSync(path.dirname(alvo), { recursive: true });
    writeFileSync(alvo, conteudo);
  }
  return dir;
}

test("aceita adaptador que usa o gate", () => {
  const dir = projeto({ "llm/x.ts": "constructor(private gate: IntegrationGate) {}\nawait fetch(url);" });
  assert.deepEqual(verificar(dir, {}), []);
});

test("acusa fetch sem gate", () => {
  const dir = projeto({ "novo/adaptador.ts": "const r = await fetch(url);" });
  assert.equal(verificar(dir, {}).length, 1);
});

test("acusa cliente HTTP importado sem gate", () => {
  const dir = projeto({ "novo/a.ts": 'import axios from "axios";', "novo/b.ts": 'import https from "node:https";' });
  assert.equal(verificar(dir, {}).length, 2);
});

test("aceita a exceção registrada e ignora testes e código sem rede", () => {
  const dir = projeto({
    "email/a.ts": "await fetch(url);",
    "email/a.spec.ts": "await fetch(url);",
    "x/puro.ts": "export const a = 1; // refetch(x)",
  });
  assert.deepEqual(verificar(dir, { "email/a.ts": "motivo" }), []);
});
