#!/usr/bin/env node
// Lint estático (T018, FR-034): nenhuma gravação no event_log fora de
// apps/api/src/audit/. Hoje há chamadas diretas herdadas nos repositórios;
// scripts/eventlog-legado.json é a linha de base delas e só pode diminuir.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PADRAO = /eventLog\s*\.\s*(?:create|createMany)\s*\(/g;

function arquivosTs(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = path.join(dir, nome);
    if (statSync(caminho).isDirectory()) return nome === "node_modules" ? [] : arquivosTs(caminho);
    return caminho.endsWith(".ts") && !caminho.endsWith(".spec.ts") ? [caminho] : [];
  });
}

/** Conta as chamadas por arquivo (caminho relativo a `srcDir`), ignorando a pasta audit/. */
export function contarChamadas(srcDir) {
  const contagem = {};
  for (const arquivo of arquivosTs(srcDir)) {
    const relativo = path.relative(srcDir, arquivo).split(path.sep).join("/");
    if (relativo.startsWith("audit/")) continue;
    const total = [...readFileSync(arquivo, "utf8").matchAll(PADRAO)].length;
    if (total > 0) contagem[relativo] = total;
  }
  return contagem;
}

/** Compara com a linha de base e devolve as violações (novas ou acima do permitido) e as folgas. */
export function comparar(contagem, base) {
  const violacoes = [];
  const folgas = [];
  for (const [arquivo, total] of Object.entries(contagem)) {
    const permitido = base[arquivo] ?? 0;
    if (total > permitido) {
      violacoes.push(
        permitido === 0
          ? `${arquivo}: ${total} gravação(ões) direta(s) no event_log. Use AuditAppender (apps/api/src/audit/).`
          : `${arquivo}: ${total} gravações diretas, a linha de base permite ${permitido}. Use AuditAppender.`,
      );
    }
  }
  for (const [arquivo, permitido] of Object.entries(base)) {
    const total = contagem[arquivo] ?? 0;
    if (total < permitido) folgas.push(`${arquivo}: base ${permitido}, agora ${total}`);
  }
  return { violacoes, folgas };
}

function principal() {
  const srcDir = path.join(RAIZ, "apps/api/src");
  const base = JSON.parse(readFileSync(path.join(RAIZ, "scripts/eventlog-legado.json"), "utf8")).arquivos;
  const { violacoes, folgas } = comparar(contarChamadas(srcDir), base);
  if (violacoes.length > 0) {
    console.error("verifica-eventlog: gravação direta no event_log fora de audit/:");
    for (const v of violacoes) console.error(`  - ${v}`);
    process.exit(1);
  }
  if (folgas.length > 0) {
    console.log("verifica-eventlog: a linha de base pode baixar (atualize scripts/eventlog-legado.json):");
    for (const f of folgas) console.log(`  - ${f}`);
  }
  console.log("verifica-eventlog: ok");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) principal();
