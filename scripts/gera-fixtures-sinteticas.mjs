#!/usr/bin/env node
// Gera, de forma determinística, os dados sintéticos que substituem os reais
// (spec 002, US2): CNPJ e CPF com dígito válido na faixa reservada (ver
// dados-sinteticos.mjs), nomes e unidades consumidoras fictícios. Grava a lista
// de permitidos usada pelo scanner. Mesma semente, mesma saída.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { cnpjSintetico, cpfSintetico, formataCnpj, formataCpf } from "./dados-sinteticos.mjs";

const SEMENTE = 20261005;
const NOMES = ["Cliente Exemplo Alfa", "Cliente Exemplo Beta", "Cliente Exemplo Gama", "Cliente Exemplo Delta"];

/** Gerador congruencial simples: o suficiente para ser reproduzível sem dependência. */
function gerador(semente) {
  let estado = semente % 2147483647;
  return () => (estado = (estado * 48271) % 2147483647);
}

export function geraFixtures(quantidade = 20, semente = SEMENTE) {
  const proximo = gerador(semente);
  const cnpjs = [];
  const cpfs = [];
  const ucs = [];
  for (let i = 0; i < quantidade; i += 1) {
    const sequencia = proximo() % 1000;
    cnpjs.push(cnpjSintetico(sequencia));
    cpfs.push(cpfSintetico(sequencia));
    ucs.push(`UC-${9000000 + (proximo() % 1000000)}`);
  }
  return {
    cnpjs: [...new Set(cnpjs)],
    cpfs: [...new Set(cpfs)],
    ucs: [...new Set(ucs)],
    nomes: NOMES.slice(),
    formata: { cnpj: formataCnpj, cpf: formataCpf },
  };
}

export function listaDePermitidos(fixtures) {
  return {
    comentario: "Gerado por scripts/gera-fixtures-sinteticas.mjs. Só valores sintéticos; nunca dado de cliente.",
    documentos: [...fixtures.cnpjs, ...fixtures.cpfs],
    ucs: fixtures.ucs,
    nomes: fixtures.nomes,
    arquivos: [],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const alvo = path.join(path.dirname(fileURLToPath(import.meta.url)), "dados-sinteticos-permitidos.json");
  const lista = listaDePermitidos(geraFixtures());
  writeFileSync(alvo, `${JSON.stringify(lista, null, 2)}\n`);
  console.log(`gera-fixtures-sinteticas: ${lista.documentos.length} documentos, ${lista.ucs.length} UCs, ${lista.nomes.length} nomes -> ${path.relative(process.cwd(), alvo)}`);
}
