import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * O `next build` compila os CSS Modules no modo "pure" (o mesmo plugin
 * postcss-modules-local-by-default, com `mode: "pure"`): todo seletor precisa
 * de uma classe ou id local. O `next dev` não acusa, e uma folha impura quebra
 * o build mesmo numa rota fechada (PLU-361). Este teste roda o mesmo plugin
 * sobre todas as folhas `.module.css` da web, sem precisar do build.
 */
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const doNext = createRequire(createRequire(import.meta.url).resolve("next/package.json"));
const postcss = doNext("postcss") as (plugins: unknown[]) => { process: (css: string, opcoes: { from: string }) => { toString: () => string } };
const localPorPadrao = doNext("next/dist/compiled/postcss-modules-local-by-default") as (opcoes: { mode: string }) => unknown;

function folhas(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = path.join(dir, nome);
    if (nome === "node_modules" || nome === ".next") return [];
    if (statSync(caminho).isDirectory()) return folhas(caminho);
    return nome.endsWith(".module.css") ? [caminho] : [];
  });
}

const impura = (css: string, de = "teste.module.css") => {
  // O processamento é preguiçoso: o toString() roda o plugin, de forma síncrona.
  try { postcss([localPorPadrao({ mode: "pure" })]).process(css, { from: de }).toString(); return null; } catch (erro) { return (erro as Error).message; }
};

describe("CSS Modules puros, como o next build exige", () => {
  it("o verificador recusa um seletor só com classe global e elemento, e aceita o ancorado numa classe local", () => {
    assert.match(impura(':global(.ui-file-list) li[data-invalido="true"] { color: red; }') ?? "", /pure/);
    assert.equal(impura('.arquivo :global(.ui-file-list) li[data-invalido="true"] { color: red; }'), null);
    assert.equal(impura("@media (max-width: 767px) { .lado { gap: 8px; } }"), null);
  });

  it("nenhuma folha .module.css da web tem seletor impuro", () => {
    const achados = folhas(path.join(raiz, "app")).flatMap((arquivo) => {
      const erro = impura(readFileSync(arquivo, "utf8"), arquivo);
      return erro ? [`${path.relative(raiz, arquivo)}: ${erro.split("\n")[0]}`] : [];
    });
    assert.deepEqual(achados, []);
  });
});
