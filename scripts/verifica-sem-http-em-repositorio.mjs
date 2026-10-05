#!/usr/bin/env node
// Lint estático (T103): repositório não decide status HTTP. Um arquivo `*repository*`
// sob apps/api/src não pode importar exceções HTTP de @nestjs/common; a decisão sobe
// para o serviço, com erro de domínio (apps/api/src/common/errors/dominio.ts).
// scripts/http-em-repositorio-legado.json lista os arquivos que ainda importam e só pode
// diminuir: arquivo novo, ou já limpo e ainda listado, falha.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMPORTACAO = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']@nestjs\/common["']/g;
const EXCECAO_HTTP = /^(?:\w*Exception)$/;

function arquivosDeRepositorio(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = path.join(dir, nome);
    if (statSync(caminho).isDirectory()) return nome === "node_modules" ? [] : arquivosDeRepositorio(caminho);
    return /repository.*\.ts$/.test(nome) && !nome.endsWith(".spec.ts") ? [caminho] : [];
  });
}

/** Arquivos de repositório (relativos a `srcDir`) que importam exceção HTTP de @nestjs/common. */
export function arquivosComExcecaoHttp(srcDir) {
  const encontrados = [];
  for (const arquivo of arquivosDeRepositorio(srcDir)) {
    const texto = readFileSync(arquivo, "utf8");
    const importaExcecao = [...texto.matchAll(IMPORTACAO)].some(([, nomes]) =>
      nomes
        .split(",")
        .map((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0])
        .some((n) => EXCECAO_HTTP.test(n)),
    );
    if (importaExcecao) encontrados.push(path.relative(srcDir, arquivo).split(path.sep).join("/"));
  }
  return encontrados.sort();
}

/** Compara com a linha de base: `violacoes` são os novos, `folgas` os que já saíram da lista de legado. */
export function comparar(encontrados, base) {
  const violacoes = encontrados
    .filter((a) => !base.includes(a))
    .map((a) => `${a}: repositório importa exceção HTTP de @nestjs/common. Lance erro de domínio (common/errors/dominio.ts).`);
  const folgas = base.filter((a) => !encontrados.includes(a)).map((a) => `${a}: já está limpo, tire da linha de base`);
  return { violacoes, folgas };
}

function principal() {
  const srcDir = path.join(RAIZ, "apps/api/src");
  const base = JSON.parse(readFileSync(path.join(RAIZ, "scripts/http-em-repositorio-legado.json"), "utf8")).arquivos;
  const { violacoes, folgas } = comparar(arquivosComExcecaoHttp(srcDir), base);
  if (violacoes.length > 0 || folgas.length > 0) {
    console.error("verifica-sem-http-em-repositorio:");
    for (const v of violacoes) console.error(`  - ${v}`);
    for (const f of folgas) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`verifica-sem-http-em-repositorio: ok (${base.length} arquivo(s) legado(s) restante(s))`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
