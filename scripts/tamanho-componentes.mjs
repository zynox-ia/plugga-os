#!/usr/bin/env node
// Falha se um componente do web passar de 600 linhas sem estar na lista de exceções,
// ou se uma exceção crescer além do teto registrado (spec 002, T206).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(fileURLToPath(new URL(".", import.meta.url)), "..");

export function listaTsx(dir) {
  const achados = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (nome === "node_modules" || nome === ".next") continue;
    if (statSync(caminho).isDirectory()) achados.push(...listaTsx(caminho));
    else if (nome.endsWith(".tsx")) achados.push(caminho);
  }
  return achados;
}

export function verifica(arquivos, { limite, excecoes }) {
  const problemas = [];
  for (const { caminho, linhas } of arquivos) {
    const teto = excecoes[caminho];
    if (teto === undefined && linhas > limite) {
      problemas.push(`${caminho}: ${linhas} linhas (limite ${limite}); divida o componente`);
    } else if (teto !== undefined && linhas > teto) {
      problemas.push(`${caminho}: ${linhas} linhas, acima do teto ${teto} da exceção`);
    }
  }
  return problemas;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync(join(RAIZ, "scripts/tamanho-componentes.json"), "utf8"));
  const arquivos = listaTsx(join(RAIZ, "apps/web/app")).map((p) => ({
    caminho: relative(RAIZ, p).split("\\").join("/"),
    linhas: readFileSync(p, "utf8").split("\n").length - 1,
  }));
  const problemas = verifica(arquivos, config);
  if (problemas.length) {
    console.error(problemas.join("\n"));
    process.exit(1);
  }
  console.log(`tamanho-componentes: ok (${arquivos.length} arquivos)`);
}
