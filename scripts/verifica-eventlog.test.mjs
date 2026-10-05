import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { comparar, contarChamadas } from "./verifica-eventlog.mjs";

function projeto(arquivos) {
  const dir = mkdtempSync(path.join(tmpdir(), "eventlog-"));
  for (const [relativo, conteudo] of Object.entries(arquivos)) {
    const alvo = path.join(dir, relativo);
    mkdirSync(path.dirname(alvo), { recursive: true });
    writeFileSync(alvo, conteudo);
  }
  return dir;
}

test("ignora a pasta audit/ e os arquivos de teste", () => {
  const dir = projeto({
    "audit/audit-appender.ts": "await tx.eventLog.create({});",
    "x/x.spec.ts": "await prisma.eventLog.create({});",
  });
  assert.deepEqual(contarChamadas(dir), {});
});

test("acusa chamada nova fora de audit/", () => {
  const dir = projeto({ "clientes/repo.ts": "await tx.eventLog.create({});\nawait tx.eventLog\n  .create({});" });
  const contagem = contarChamadas(dir);
  assert.deepEqual(contagem, { "clientes/repo.ts": 2 });
  const { violacoes } = comparar(contagem, {});
  assert.equal(violacoes.length, 1);
  assert.match(violacoes[0], /AuditAppender/);
});

test("aceita até o que a linha de base permite e avisa a folga", () => {
  assert.deepEqual(comparar({ "a.ts": 2 }, { "a.ts": 2 }), { violacoes: [], folgas: [] });
  assert.equal(comparar({ "a.ts": 3 }, { "a.ts": 2 }).violacoes.length, 1);
  assert.equal(comparar({ "a.ts": 1 }, { "a.ts": 2 }).folgas.length, 1);
});

test("a árvore real passa na linha de base versionada", async () => {
  const { readFileSync } = await import("node:fs");
  const base = JSON.parse(readFileSync(new URL("./eventlog-legado.json", import.meta.url), "utf8")).arquivos;
  const real = contarChamadas(new URL("../apps/api/src", import.meta.url).pathname);
  assert.deepEqual(comparar(real, base).violacoes, []);
});
