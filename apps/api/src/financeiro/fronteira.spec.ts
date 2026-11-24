import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O Plugga OS é o dono do financeiro e o OMIE é um conector desligável (decisão do André
 * de 24/11/2026). O núcleo do Financeiro não importa nada do conector: quem depende é o
 * conector, que se inscreve em `ReflexosDoLancamento`.
 */
describe("fronteira do Financeiro com os conectores", () => {
  it("nenhum arquivo do núcleo do Financeiro importa o módulo do OMIE", () => {
    const pasta = __dirname;
    const importacoes = readdirSync(pasta)
      .filter((arquivo) => arquivo.endsWith(".ts") && !arquivo.endsWith(".spec.ts"))
      .flatMap((arquivo) => readFileSync(join(pasta, arquivo), "utf8")
        .split("\n")
        .filter((linha) => /^\s*import\b.*from\s+["']\.\.\/omie\//.test(linha))
        .map((linha) => `${arquivo}: ${linha.trim()}`));
    expect(importacoes).toEqual([]);
  });
});
