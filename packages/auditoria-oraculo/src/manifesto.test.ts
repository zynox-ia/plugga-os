import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

import {
  gerarManifesto,
  lerManifesto,
  serializarManifesto,
  verificarManifesto,
} from "./manifesto.ts";
import {
  caminhosDoOraculo,
  goldenSantaTereza,
  raizDaReferencia,
  totalDeArquivosNormativos,
} from "./oraculo.ts";

const temporarios: string[] = [];

after(async () => {
  await Promise.all(temporarios.map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Árvore mínima e sintética: o mecanismo é o mesmo, o teste custa milissegundos. */
async function arvoreDeTeste(): Promise<string> {
  const raiz = await mkdtemp(path.join(tmpdir(), "oraculo-"));
  temporarios.push(raiz);
  await mkdir(path.join(raiz, "assets"), { recursive: true });
  await writeFile(path.join(raiz, "PRD.md"), "norma\n", "utf8");
  await writeFile(path.join(raiz, "assets", "motor.py"), "print(1)\n", "utf8");
  return raiz;
}

describe("manifesto da referência congelada", () => {
  test("cobre os 141 arquivos normativos e confere com a árvore", async () => {
    const manifesto = await lerManifesto();

    assert.equal(manifesto.totalDeArquivos, totalDeArquivosNormativos);
    assert.equal(manifesto.arquivos.length, totalDeArquivosNormativos);
    assert.deepEqual(await verificarManifesto(manifesto), []);
  });

  test("declara as exclusões em vez de escondê-las", async () => {
    const manifesto = await lerManifesto();

    assert.deepEqual(manifesto.exclusoes, [".DS_Store", "__pycache__"]);
  });

  test("é estável entre execuções", async () => {
    const primeira = serializarManifesto(await gerarManifesto());
    const segunda = serializarManifesto(await gerarManifesto());

    assert.equal(primeira, segunda);
  });

  test("o arquivo em disco é exatamente o que o gerador produz", async () => {
    const emDisco = await readFile(
      path.join(raizDaReferencia, "..", "manifesto.json"),
      "utf8",
    );

    assert.equal(emDisco, serializarManifesto(await gerarManifesto()));
  });

  test("detecta mutação de conteúdo", async () => {
    const raiz = await arvoreDeTeste();
    const manifesto = await gerarManifesto(raiz);
    await writeFile(path.join(raiz, "PRD.md"), "norma adulterada\n", "utf8");

    const problemas = await verificarManifesto(manifesto, raiz);

    assert.equal(problemas.length, 1);
    assert.equal(problemas[0]?.tipo, "alterado");
    assert.equal(problemas[0]?.caminho, "PRD.md");
  });

  test("detecta arquivo removido", async () => {
    const raiz = await arvoreDeTeste();
    const manifesto = await gerarManifesto(raiz);
    await rm(path.join(raiz, "assets", "motor.py"));

    const problemas = await verificarManifesto(manifesto, raiz);

    assert.deepEqual(problemas, [{ tipo: "ausente", caminho: "assets/motor.py" }]);
  });

  test("detecta arquivo acrescentado sem atualização deliberada", async () => {
    const raiz = await arvoreDeTeste();
    const manifesto = await gerarManifesto(raiz);
    await writeFile(path.join(raiz, "assets", "extra.py"), "print(2)\n", "utf8");

    const problemas = await verificarManifesto(manifesto, raiz);

    assert.deepEqual(problemas, [
      { tipo: "nao_registrado", caminho: "assets/extra.py" },
    ]);
  });

  test("rodar o oráculo não invalida a árvore: .pyc e .DS_Store ficam fora", async () => {
    const raiz = await arvoreDeTeste();
    const manifesto = await gerarManifesto(raiz);
    await mkdir(path.join(raiz, "assets", "__pycache__"), { recursive: true });
    await writeFile(
      path.join(raiz, "assets", "__pycache__", "motor.cpython-314.pyc"),
      "bytecode",
      "utf8",
    );
    await writeFile(path.join(raiz, ".DS_Store"), "finder", "utf8");

    assert.deepEqual(await verificarManifesto(manifesto, raiz), []);
  });
});

describe("golden do próprio pacote", () => {
  test("os MD5 congelados são os que a referência declara", async () => {
    const hashes = JSON.parse(
      await readFile(path.join(raizDaReferencia, caminhosDoOraculo.goldenHashes), "utf8"),
    ) as { desktop: string; celular: string };

    assert.deepEqual(hashes, {
      desktop: goldenSantaTereza.desktop,
      celular: goldenSantaTereza.celular,
    });
  });
});
