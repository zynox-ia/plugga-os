import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, test } from "node:test";

import { divergenciasAprovadas, divergenciasRetiradas } from "./divergencias.ts";
import { raizDoPacote } from "./oraculo.ts";

const raizDoRepo = path.resolve(raizDoPacote, "..", "..");

async function pacotesDoWorkspace(): Promise<string[]> {
  const grupos = ["apps", "packages"];
  const encontrados: string[] = [];

  for (const grupo of grupos) {
    const entradas = await readdir(path.join(raizDoRepo, grupo), {
      withFileTypes: true,
    });
    for (const entrada of entradas) {
      if (!entrada.isDirectory()) continue;
      const dir = path.join(raizDoRepo, grupo, entrada.name);
      if (dir === raizDoPacote) continue;
      encontrados.push(dir);
    }
  }

  return encontrados;
}

describe("o oráculo é tooling, nunca runtime", () => {
  test("nenhum outro pacote do workspace depende dele", async () => {
    const dependentes: string[] = [];

    for (const dir of await pacotesDoWorkspace()) {
      const manifesto = JSON.parse(
        await readFile(path.join(dir, "package.json"), "utf8"),
      ) as {
        name: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const todas = {
        ...manifesto.dependencies,
        ...manifesto.devDependencies,
      };
      if ("@plugga/auditoria-oraculo" in todas) dependentes.push(manifesto.name);
    }

    assert.deepEqual(
      dependentes,
      [],
      "A referência congelada e o oráculo Python não podem entrar no caminho produtivo.",
    );
  });

  test("o pacote não declara dependência de runtime", async () => {
    const manifesto = JSON.parse(
      await readFile(path.join(raizDoPacote, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    assert.equal(manifesto.dependencies, undefined);
  });
});

describe("registro de divergências", () => {
  test("os identificadores são únicos", () => {
    const ids = divergenciasAprovadas.map((d) => d.id);

    assert.equal(new Set(ids).size, ids.length);
  });

  test("cada divergência traz fonte, decisão, impacto e aprovação", () => {
    for (const divergencia of divergenciasAprovadas) {
      for (const [campo, valor] of Object.entries(divergencia)) {
        if (Array.isArray(valor)) {
          assert.ok(valor.length > 0, `${divergencia.id}: ${campo} vazio`);
          continue;
        }
        assert.ok(
          typeof valor === "string" && valor.trim().length > 0,
          `${divergencia.id}: ${campo} vazio`,
        );
      }
    }
  });

  test("D-003 permanece retirada: o gerador reconcilia os rótulos sozinho", () => {
    assert.ok(divergenciasRetiradas.includes("D-003"));
    assert.equal(
      divergenciasAprovadas.find((d) => d.id === "D-003"),
      undefined,
    );
  });

  test("D-001 registra o spread de 8× e os três casos que ele alcança", () => {
    const d001 = divergenciasAprovadas.find((d) => d.id === "D-001");

    assert.ok(d001);
    assert.deepEqual(d001.afeta, ["Brasília", "Jatuarana", "Imigrantes"]);
  });
});
