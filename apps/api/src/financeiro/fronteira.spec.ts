import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O Plugga OS é o dono do financeiro e o OMIE é um conector desligável (decisão do André
 * de 24/11/2026). O núcleo do Financeiro não importa nada do conector: quem depende é o
 * conector, que se inscreve em `ReflexosDoLancamento`.
 */

/** `from "../omie/…"` (inclusive de import quebrado em várias linhas), `require(` e `import(` dinâmico. */
const DO_OMIE = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)["'](?:\.\.\/)+omie(?:\/[^"']*)?["']/g;

const importacoesDoOmie = (fonte: string): string[] => [...fonte.matchAll(DO_OMIE)].map((m) => m[0]);

describe("fronteira do Financeiro com os conectores", () => {
  it("a busca pega import em uma linha, em várias, require e import dinâmico", () => {
    expect(importacoesDoOmie(`import { a } from "../omie/x";`)).toHaveLength(1);
    expect(importacoesDoOmie(`import {\n  a,\n  b,\n} from\n  '../omie/x';`)).toHaveLength(1);
    expect(importacoesDoOmie(`const x = require("../omie/x");`)).toHaveLength(1);
    expect(importacoesDoOmie(`const x = await import ( "../omie" );`)).toHaveLength(1);
    expect(importacoesDoOmie(`import type { A } from "../../omie/x";`)).toHaveLength(1);
    expect(importacoesDoOmie(`import { a } from "../omie-algo/x"; import { b } from "./omie/x";`)).toEqual([]);
  });

  it("nenhum arquivo do núcleo do Financeiro importa o módulo do OMIE", () => {
    const pasta = __dirname;
    const arquivos = readdirSync(pasta, { recursive: true, encoding: "utf8" })
      .filter((arquivo) => arquivo.endsWith(".ts") && !arquivo.endsWith(".spec.ts"));
    expect(arquivos.length).toBeGreaterThan(0);
    const importacoes = arquivos
      .flatMap((arquivo) => importacoesDoOmie(readFileSync(join(pasta, arquivo), "utf8")).map((i) => `${arquivo}: ${i}`));
    expect(importacoes).toEqual([]);
  });
});
