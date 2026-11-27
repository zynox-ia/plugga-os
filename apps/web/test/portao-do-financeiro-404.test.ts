import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * O 404 do Financeiro fechado (PLU-336) vem do `notFound()` do layout dele. O
 * Next só manda o status 404 se a resposta ainda não começou a ser transmitida:
 * um `loading.tsx`, um `template.tsx`, um `<Suspense>` ou um `generateMetadata`
 * acima do layout abriria o streaming antes, e a rota fechada sairia com 200.
 * Este teste trava essa condição; o status HTTP de verdade é conferido num
 * build fechado (roteiro no relatório da PLU-336).
 */
const app = new URL("../app/", import.meta.url);
const ler = (caminho: string) => readFileSync(new URL(caminho, app), "utf8");

describe("Financeiro fechado: nada abre o streaming antes do notFound() do layout", () => {
  it("sem loading.tsx nem template.tsx na raiz ou no Financeiro", () => {
    for (const pasta of ["", "financeiro/"]) {
      for (const arquivo of ["loading.tsx", "loading.ts", "loading.jsx", "template.tsx", "template.ts", "template.jsx"]) {
        assert.equal(existsSync(new URL(`${pasta}${arquivo}`, app)), false, `${pasta}${arquivo}`);
      }
    }
  });

  it("o layout raiz não abre Suspense nem metadata assíncrona", () => {
    const raiz = ler("layout.tsx");
    assert.doesNotMatch(raiz, /<Suspense|generateMetadata/);
  });

  it("o layout do Financeiro chama notFound() antes de renderizar as páginas", () => {
    const layout = ler("financeiro/layout.tsx");
    assert.match(layout, /if \(!financeiroHabilitado\(\)\) notFound\(\);\s*return children;/);
  });
});
