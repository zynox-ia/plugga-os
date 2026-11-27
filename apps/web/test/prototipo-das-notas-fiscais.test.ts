import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { itemDasNotasFiscais, prototipoDasNotasFiscais } from "../app/lib/prototipo-das-notas-fiscais.ts";

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXEMPLOS = path.join(WEB, "app/lib/notas-fiscais-exemplo.ts");

function fontes(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = path.join(dir, nome);
    if (nome === "node_modules" || nome === ".next") return [];
    if (statSync(caminho).isDirectory()) return fontes(caminho);
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : [];
  });
}
/** Os imports relativos de um arquivo, resolvidos para o caminho no disco (estáticos e dinâmicos). */
function importsRelativos(arquivo: string): string[] {
  const texto = readFileSync(arquivo, "utf8");
  const especificadores = [...texto.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)].map((m) => m[1]!);
  return especificadores.flatMap((esp) => {
    const base = path.resolve(path.dirname(arquivo), esp);
    const candidato = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")].find((c) => existsSync(c) && statSync(c).isFile());
    return candidato ? [candidato] : [];
  });
}
const ehCliente = (arquivo: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(readFileSync(arquivo, "utf8"));

describe("os exemplos das Notas fiscais fora do bundle de cliente e do de produção (PLU-361)", () => {
  it("nenhum componente cliente alcança o módulo dos exemplos, nem por import indireto", () => {
    const clientes = fontes(path.join(WEB, "app")).filter(ehCliente);
    assert.ok(clientes.some((c) => c.endsWith("notas-fiscais-view.tsx")), "a view das Notas é cliente");
    const alcancam = clientes.filter((inicio) => {
      const vistos = new Set<string>();
      const fila = [inicio];
      while (fila.length) {
        const atual = fila.pop()!;
        if (vistos.has(atual)) continue;
        vistos.add(atual);
        if (atual === EXEMPLOS) return true;
        fila.push(...importsRelativos(atual));
      }
      return false;
    });
    assert.deepEqual(alcancam.map((c) => path.relative(WEB, c)), []);
  });

  it("a página importa os exemplos só por import() dentro do ramo do NODE_ENV escrito por extenso (o webpack o descarta em produção)", () => {
    const pagina = readFileSync(path.join(WEB, "app/financeiro/notas-fiscais/page.tsx"), "utf8");
    assert.doesNotMatch(pagina, /^import[^\n]*notas-fiscais-exemplo/m, "sem import estático dos exemplos");
    const ramo = 'if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {';
    const inicio = pagina.indexOf(ramo);
    assert.ok(inicio >= 0, "a condição vai literal, para o webpack avaliá-la no build");
    const importDinamico = pagina.indexOf('import("../../lib/notas-fiscais-exemplo")');
    const fimDoRamo = pagina.indexOf("\n  }\n  notFound();", inicio);
    assert.ok(importDinamico > inicio && importDinamico < fimDoRamo, "o import() fica dentro do ramo");
    // A condição literal é a mesma da trava.
    for (const NODE_ENV of ["development", "test", "production", "", "staging", undefined]) {
      assert.equal(prototipoDasNotasFiscais({ NODE_ENV }), NODE_ENV === "development" || NODE_ENV === "test", String(NODE_ENV));
    }
  });
});

describe("protótipo das Notas fiscais só fora da produção (PLU-361)", () => {
  it("abre no desenvolvimento e nos testes", () => {
    assert.equal(prototipoDasNotasFiscais({ NODE_ENV: "development" }), true);
    assert.equal(prototipoDasNotasFiscais({ NODE_ENV: "test" }), true);
    assert.deepEqual(itemDasNotasFiscais({ NODE_ENV: "development" }), { rota: "/financeiro/notas-fiscais", status: "parcial" });
  });

  it("na produção a rota fecha (404) e o item do menu fica em breve, sem rota", () => {
    assert.equal(prototipoDasNotasFiscais({ NODE_ENV: "production" }), false);
    assert.deepEqual(itemDasNotasFiscais({ NODE_ENV: "production" }), { status: "em-breve" });
  });

  it("nem o build da CI, com o Financeiro ligado pela variável, abre o protótipo", () => {
    const daCi = { NODE_ENV: "production", NEXT_PUBLIC_FINANCEIRO_HABILITADO: "true" };
    assert.equal(prototipoDasNotasFiscais(daCi), false);
    assert.deepEqual(itemDasNotasFiscais(daCi), { status: "em-breve" });
  });

  it("sem NODE_ENV conhecido, fica fechado (falha fechada)", () => {
    assert.equal(prototipoDasNotasFiscais({}), false);
    assert.equal(prototipoDasNotasFiscais({ NODE_ENV: "" }), false);
    assert.equal(prototipoDasNotasFiscais({ NODE_ENV: "staging" }), false);
  });
});
