import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { Acesso } from "@plugga/shared";

import { fechadaPeloPortaoDoFinanceiro, podeAbrirPagina } from "../app/lib/acesso-paginas.ts";
import { itemDasNotasFiscais, prototipoDasNotasFiscais } from "../app/lib/prototipo-das-notas-fiscais.ts";

const ROTA = "/financeiro/notas-fiscais";
const fiscal: Acesso = { plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro", telas: ["financeiro.fiscal"] }] };

describe("o middleware responde 404 ao protótipo das Notas fiscais fora do desenvolvimento (PLU-361)", () => {
  it("na produção e no build da CI (Financeiro ligado pela variável), a rota e as variações do caminho fecham; o resto do Financeiro, não", () => {
    for (const ambiente of [{ NODE_ENV: "production" }, { NODE_ENV: "production", NEXT_PUBLIC_FINANCEIRO_HABILITADO: "true" }, {}]) {
      for (const caminho of [ROTA, `${ROTA}/`, "/financeiro/Notas-Fiscais", "/financeiro//notas-fiscais", "/financeiro/%6Eotas-fiscais"]) {
        assert.equal(fechadaPeloPortaoDoFinanceiro(caminho, ambiente), true, `${JSON.stringify(ambiente)} ${caminho}`);
        assert.equal(podeAbrirPagina(fiscal, caminho, ambiente), false, `${JSON.stringify(ambiente)} ${caminho}`);
      }
    }
    const daCi = { NODE_ENV: "production", NEXT_PUBLIC_FINANCEIRO_HABILITADO: "true" };
    assert.equal(fechadaPeloPortaoDoFinanceiro("/financeiro/conciliacao", daCi), false);
    assert.equal(fechadaPeloPortaoDoFinanceiro("/financeiro/notas-fiscais-de-verdade", daCi), false);
  });

  it("no desenvolvimento e nos testes, a rota abre para quem tem a tela Fiscal", () => {
    for (const NODE_ENV of ["development", "test"]) {
      assert.equal(fechadaPeloPortaoDoFinanceiro(ROTA, { NODE_ENV }), false, NODE_ENV);
      assert.equal(podeAbrirPagina(fiscal, ROTA, { NODE_ENV }), true, NODE_ENV);
    }
  });
});

const WEB = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXEMPLOS = path.join(WEB, "app/lib/notas-fiscais-exemplo.ts");

/** Fim de linha LF: um checkout no Windows (core.autocrlf) pode trazer o código com CRLF. */
const emLf = (texto: string) => texto.replace(/\r\n/g, "\n");
const comCrlf = (texto: string) => emLf(texto).replace(/\n/g, "\r\n");
/** O código-fonte como texto, sem depender do fim de linha do checkout. */
const lerFonte = (arquivo: string) => emLf(readFileSync(arquivo, "utf8"));

function fontes(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = path.join(dir, nome);
    if (nome === "node_modules" || nome === ".next") return [];
    if (statSync(caminho).isDirectory()) return fontes(caminho);
    return /\.(ts|tsx)$/.test(nome) ? [caminho] : [];
  });
}
/** Os imports relativos de um texto de código, resolvidos para o caminho no disco (estáticos e dinâmicos). */
function importsRelativos(arquivo: string, texto = lerFonte(arquivo)): string[] {
  const especificadores = [...emLf(texto).matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)].map((m) => m[1]!);
  return especificadores.flatMap((esp) => {
    const base = path.resolve(path.dirname(arquivo), esp);
    const candidato = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")].find((c) => existsSync(c) && statSync(c).isFile());
    return candidato ? [candidato] : [];
  });
}
/** "use client" no topo, depois de comentários (de linha ou de bloco). */
const ehCliente = (texto: string) => /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(emLf(texto));

/** O que falta na página para os exemplos sumirem do build de produção; nulo quando ela está certa. */
function problemaDaPagina(texto: string): string | null {
  const pagina = emLf(texto);
  if (/^import[^\n]*notas-fiscais-exemplo/m.test(pagina)) return "import estático dos exemplos";
  const inicio = pagina.indexOf('if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {');
  if (inicio < 0) return "a condição não vai literal, e o webpack não a avalia no build";
  const importDinamico = pagina.indexOf('import("../../lib/notas-fiscais-exemplo")');
  const fimDoRamo = pagina.indexOf("\n  }\n  notFound();", inicio);
  if (fimDoRamo < 0 || importDinamico < inicio || importDinamico > fimDoRamo) return "o import() não fica dentro do ramo";
  return null;
}

describe("os exemplos das Notas fiscais fora do bundle de cliente e do de produção (PLU-361)", () => {
  it("nenhum componente cliente alcança o módulo dos exemplos, nem por import indireto", () => {
    const clientes = fontes(path.join(WEB, "app")).filter((arquivo) => ehCliente(lerFonte(arquivo)));
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

  it("a leitura do código não depende do fim de linha: \"use client\" e os imports valem em LF e em CRLF", () => {
    const view = path.join(WEB, "app/components/financeiro/notas-fiscais-view.tsx");
    const texto = lerFonte(view);
    for (const [rotulo, versao] of [["LF", texto], ["CRLF", comCrlf(texto)]] as const) {
      assert.equal(ehCliente(versao), true, rotulo);
      assert.deepEqual(importsRelativos(view, versao), importsRelativos(view, texto), rotulo);
    }
    const comComentario = "// comentário\n/* bloco\n */\n\"use client\";\nimport x from \"./y\";\n";
    assert.equal(ehCliente(comComentario), true);
    assert.equal(ehCliente(comCrlf(comComentario)), true);
  });

  it("a página importa os exemplos só por import() dentro do ramo do NODE_ENV escrito por extenso (o webpack o descarta em produção)", () => {
    const pagina = readFileSync(path.join(WEB, "app/financeiro/notas-fiscais/page.tsx"), "utf8");
    // Como está no disco e nos dois fins de linha, seja qual for o deste checkout.
    for (const [rotulo, versao] of [["disco", pagina], ["LF", emLf(pagina)], ["CRLF", comCrlf(pagina)]] as const) {
      assert.equal(problemaDaPagina(versao), null, rotulo);
    }
    // E a conferência recusa a página errada, também nos dois fins de linha.
    const importFora = emLf(pagina)
      .replace('import("../../lib/notas-fiscais-exemplo"),', "Promise.resolve({} as never),")
      .replace("\n  notFound();", '\n  notFound();\n  void import("../../lib/notas-fiscais-exemplo");');
    const importEstatico = 'import { notasDeExemplo } from "../../lib/notas-fiscais-exemplo";\n' + emLf(pagina);
    for (const versao of [importFora, comCrlf(importFora)]) assert.equal(problemaDaPagina(versao), "o import() não fica dentro do ramo");
    for (const versao of [importEstatico, comCrlf(importEstatico)]) assert.equal(problemaDaPagina(versao), "import estático dos exemplos");
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
