import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { arquivosComExcecaoHttp, comparar } from "./verifica-sem-http-em-repositorio.mjs";

function projeto(arquivos) {
  const dir = mkdtempSync(path.join(tmpdir(), "http-repo-"));
  for (const [relativo, conteudo] of Object.entries(arquivos)) {
    const alvo = path.join(dir, relativo);
    mkdirSync(path.dirname(alvo), { recursive: true });
    writeFileSync(alvo, conteudo);
  }
  return dir;
}

test("acusa repositório que importa exceção HTTP, também com alias e type", () => {
  const dir = projeto({
    "a/prisma-a.repository.ts": 'import { Injectable, NotFoundException } from "@nestjs/common";',
    "b/b.repository.ts": 'import { BadRequestException as Ruim } from "@nestjs/common";',
    "c/c.repository.ts": 'import { type ConflictException } from "@nestjs/common";',
  });
  assert.deepEqual(arquivosComExcecaoHttp(dir), ["a/prisma-a.repository.ts", "b/b.repository.ts", "c/c.repository.ts"]);
});

test("ignora o que não é repositório, testes e importações sem exceção", () => {
  const dir = projeto({
    "a/a.service.ts": 'import { NotFoundException } from "@nestjs/common";',
    "a/a.repository.spec.ts": 'import { NotFoundException } from "@nestjs/common";',
    "a/b.repository.ts": 'import { Injectable, Inject } from "@nestjs/common";',
  });
  assert.deepEqual(arquivosComExcecaoHttp(dir), []);
});

test("compara com a linha de base: novo falha, limpo ainda listado pede remoção", () => {
  const { violacoes, folgas } = comparar(["x.repository.ts", "y.repository.ts"], ["y.repository.ts", "z.repository.ts"]);
  assert.equal(violacoes.length, 1);
  assert.match(violacoes[0], /^x\.repository\.ts/);
  assert.equal(folgas.length, 1);
  assert.match(folgas[0], /^z\.repository\.ts/);
});
