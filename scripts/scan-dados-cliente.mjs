#!/usr/bin/env node
// Varredura de dado de cliente real (spec 002, US2, FR-007 a FR-010).
// Procura CNPJ e CPF com dígito verificador válido, unidade consumidora e nomes
// de cliente lidos de CLIENT_NAMES_FILE. O relatório traz arquivo, linha e tipo,
// NUNCA o valor encontrado.
//
//   node scripts/scan-dados-cliente.mjs --tree [--strict]
//   node scripts/scan-dados-cliente.mjs --history [--strict]
//
// Sem --strict (modo aviso) a saída é 0 mesmo com ocorrências; com --strict, 1.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

import { cnpjValido, cpfValido, naFaixaSintetica, ucNaFaixa } from "./dados-sinteticos.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARQUIVO_PERMITIDOS = path.join(RAIZ, "scripts", "dados-sinteticos-permitidos.json");

const RE_CNPJ = /(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g;
const RE_CPF = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g;
const RE_UC = [/(?<![A-Za-z0-9])uc[-_ ]?\d{4,}/gi, /(?<![A-Za-z0-9])UC\s*\d{7}-\d\b/gi];

const IGNORADOS = [
  /(^|\/)node_modules\//,
  /(^|\/)pnpm-lock\.yaml$/,
  /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|otf|zip|gz)$/i,
  /^scripts\/dados-sinteticos-permitidos\.json$/,
];

export const semAcento = (texto) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function carregaPermitidos(arquivo = ARQUIVO_PERMITIDOS) {
  const bruto = existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, "utf8")) : {};
  return {
    documentos: new Set(bruto.documentos ?? []),
    ucs: new Set((bruto.ucs ?? []).map((u) => u.toLowerCase())),
    nomes: new Set((bruto.nomes ?? []).map(semAcento)),
    arquivos: new Set(bruto.arquivos ?? []),
  };
}

export function carregaNomes(arquivo) {
  if (!arquivo || !existsSync(arquivo)) return [];
  return readFileSync(arquivo, "utf8")
    .split(/\r?\n/)
    .map((n) => semAcento(n.trim()))
    .filter((n) => n.length >= 3);
}

const VAZIO = { documentos: new Set(), ucs: new Set(), nomes: new Set(), arquivos: new Set() };

/** Ocorrências de uma linha: `[{ tipo }]`. O valor nunca sai desta função. */
export function varreLinha(linha, { nomes = [], permitidos = VAZIO } = {}) {
  const achados = [];
  for (const m of linha.matchAll(RE_CNPJ)) {
    const d = m[0].replace(/\D/g, "");
    if (cnpjValido(d) && !naFaixaSintetica(d) && !permitidos.documentos.has(d)) achados.push({ tipo: "cnpj" });
  }
  for (const m of linha.matchAll(RE_CPF)) {
    const d = m[0].replace(/\D/g, "");
    if (cpfValido(d) && !naFaixaSintetica(d) && !permitidos.documentos.has(d)) achados.push({ tipo: "cpf" });
  }
  for (const re of RE_UC) {
    for (const m of linha.matchAll(re)) {
      // UC só de zeros é espaço reservado de documentação, não um cliente.
      if (/^\D*0+(-0)?$/.test(m[0].replace(/\s/g, ""))) continue;
      if (ucNaFaixa(m[0].replace(/\D/g, ""))) continue;
      if (!permitidos.ucs.has(m[0].toLowerCase())) achados.push({ tipo: "unidade-consumidora" });
    }
  }
  if (nomes.length > 0) {
    const sem = semAcento(linha);
    for (const nome of nomes) {
      if (sem.includes(nome) && !permitidos.nomes.has(nome)) achados.push({ tipo: "nome-de-cliente" });
    }
  }
  return achados;
}

/** Varre arquivos em memória: `{ "caminho": "conteúdo" }` → `[{ arquivo, linha, tipo }]`. */
export function varreArquivos(arquivos, opcoes = {}) {
  const permitidos = opcoes.permitidos ?? VAZIO;
  const saida = [];
  for (const [arquivo, conteudo] of Object.entries(arquivos)) {
    if (IGNORADOS.some((re) => re.test(arquivo)) || permitidos.arquivos.has(arquivo)) continue;
    conteudo.split("\n").forEach((linha, i) => {
      for (const { tipo } of varreLinha(linha, opcoes)) saida.push({ arquivo, linha: i + 1, tipo });
    });
  }
  return saida;
}

function arquivosDaArvore() {
  const lista = execFileSync("git", ["ls-files", "-z"], { cwd: RAIZ, encoding: "utf8", maxBuffer: 1 << 28 })
    .split("\0")
    .filter(Boolean);
  const conteudos = {};
  for (const arquivo of lista) {
    if (IGNORADOS.some((re) => re.test(arquivo))) continue;
    const buffer = readFileSync(path.join(RAIZ, arquivo));
    if (buffer.includes(0)) continue; // binário
    conteudos[arquivo] = buffer.toString("utf8");
  }
  return conteudos;
}

/** Histórico inteiro: só linhas adicionadas, de todas as refs, com o commit curto no relatório. */
async function varreHistorico(opcoes) {
  const permitidos = opcoes.permitidos ?? VAZIO;
  const filho = spawn("git", ["log", "--all", "-p", "--no-color", "--format=@@commit %h", "--text"], { cwd: RAIZ });
  const achados = new Map();
  let commit = "";
  let arquivo = "";
  let linhaNova = 0;
  for await (const linha of createInterface({ input: filho.stdout, crlfDelay: Infinity })) {
    if (linha.startsWith("@@commit ")) commit = linha.slice(9);
    else if (linha.startsWith("+++ ")) arquivo = linha.startsWith("+++ b/") ? linha.slice(6) : "";
    else if (linha.startsWith("@@ ")) linhaNova = Number(/\+(\d+)/.exec(linha)?.[1] ?? 0) - 1;
    else if (linha.startsWith("+") && arquivo && !IGNORADOS.some((re) => re.test(arquivo)) && !permitidos.arquivos.has(arquivo)) {
      linhaNova += 1;
      for (const { tipo } of varreLinha(linha.slice(1), opcoes)) achados.set(`${commit} ${arquivo}:${linhaNova} ${tipo}`, { arquivo, linha: linhaNova, tipo, commit });
    } else if (!linha.startsWith("-")) linhaNova += 1;
  }
  return [...achados.values()];
}

export function relatorio(ocorrencias) {
  return ocorrencias.map((o) => `${o.commit ? `${o.commit} ` : ""}${o.arquivo}:${o.linha} ${o.tipo}`).join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const modo = args.includes("--history") ? "history" : "tree";
  const estrito = args.includes("--strict");
  const nomes = carregaNomes(process.env.CLIENT_NAMES_FILE);
  if (!process.env.CLIENT_NAMES_FILE) {
    console.warn("scan-dados-cliente: CLIENT_NAMES_FILE ausente; só documentos e UCs serão procurados.");
  }
  const opcoes = { nomes, permitidos: carregaPermitidos() };
  const ocorrencias = modo === "history" ? await varreHistorico(opcoes) : varreArquivos(arquivosDaArvore(), opcoes);
  if (ocorrencias.length === 0) {
    console.log(`scan-dados-cliente (${modo}): 0 ocorrências`);
    return;
  }
  console.log(relatorio(ocorrencias));
  console.log(`scan-dados-cliente (${modo}): ${ocorrencias.length} ocorrência(s); valores omitidos de propósito`);
  if (estrito) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
