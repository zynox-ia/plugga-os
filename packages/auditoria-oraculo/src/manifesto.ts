/**
 * Manifesto da árvore congelada: caminho, tamanho e SHA-256 de cada arquivo
 * normativo.
 *
 * Serve para uma pergunta só: a referência ainda é a mesma que foi auditada?
 * Alteração de conteúdo, arquivo removido e arquivo acrescentado são erros
 * distintos, porque a correção de cada um é diferente.
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  caminhoDoManifesto,
  exclusoesDoManifesto,
  raizDaReferencia,
} from "./oraculo.ts";

export type ArquivoDoManifesto = {
  /** Sempre relativo à raiz da referência, com `/` mesmo no Windows. */
  caminho: string;
  bytes: number;
  sha256: string;
};

export type Manifesto = {
  descricao: string;
  origem: string;
  exclusoes: string[];
  totalDeArquivos: number;
  arquivos: ArquivoDoManifesto[];
};

export type ProblemaDoManifesto =
  | { tipo: "alterado"; caminho: string; esperado: string; encontrado: string }
  | { tipo: "ausente"; caminho: string }
  | { tipo: "nao_registrado"; caminho: string };

function ehExcluido(nome: string): boolean {
  return (exclusoesDoManifesto as readonly string[]).includes(nome);
}

/**
 * Ordem estável e independente de locale — `localeCompare` mudaria o manifesto
 * conforme a máquina que o gerou.
 */
function porCaminho(a: ArquivoDoManifesto, b: ArquivoDoManifesto): number {
  if (a.caminho === b.caminho) return 0;
  return a.caminho < b.caminho ? -1 : 1;
}

async function listarArquivos(
  raiz: string,
  relativo = "",
): Promise<string[]> {
  const entradas = await readdir(path.join(raiz, relativo), {
    withFileTypes: true,
  });
  const encontrados: string[] = [];

  for (const entrada of entradas) {
    if (ehExcluido(entrada.name)) continue;
    const caminho = relativo ? `${relativo}/${entrada.name}` : entrada.name;
    if (entrada.isDirectory()) {
      encontrados.push(...(await listarArquivos(raiz, caminho)));
    } else if (entrada.isFile()) {
      encontrados.push(caminho);
    }
  }

  return encontrados;
}

async function descrever(
  raiz: string,
  caminho: string,
): Promise<ArquivoDoManifesto> {
  const conteudo = await readFile(path.join(raiz, caminho));
  return {
    caminho,
    bytes: conteudo.byteLength,
    sha256: createHash("sha256").update(conteudo).digest("hex"),
  };
}

export async function gerarManifesto(
  raiz: string = raizDaReferencia,
): Promise<Manifesto> {
  const caminhos = await listarArquivos(raiz);
  const arquivos = (
    await Promise.all(caminhos.map((caminho) => descrever(raiz, caminho)))
  ).sort(porCaminho);

  return {
    descricao:
      "Árvore congelada do pacote normativo da auditoria energética. Tooling e teste; nunca runtime de produção.",
    origem: "plugga-auditoria-energetica-COMPLETO-2026-08-09",
    exclusoes: [...exclusoesDoManifesto],
    totalDeArquivos: arquivos.length,
    arquivos,
  };
}

export async function lerManifesto(
  caminho: string = caminhoDoManifesto,
): Promise<Manifesto> {
  return JSON.parse(await readFile(caminho, "utf8")) as Manifesto;
}

export function serializarManifesto(manifesto: Manifesto): string {
  return `${JSON.stringify(manifesto, null, 2)}\n`;
}

/**
 * Confere a árvore contra o manifesto. Devolve todos os problemas de uma vez:
 * saber que só um arquivo mudou é diferente de saber que a árvore inteira foi
 * trocada.
 */
export async function verificarManifesto(
  manifesto: Manifesto,
  raiz: string = raizDaReferencia,
): Promise<ProblemaDoManifesto[]> {
  const atual = await gerarManifesto(raiz);
  const porNome = new Map(atual.arquivos.map((a) => [a.caminho, a]));
  const problemas: ProblemaDoManifesto[] = [];

  for (const esperado of manifesto.arquivos) {
    const encontrado = porNome.get(esperado.caminho);
    if (!encontrado) {
      problemas.push({ tipo: "ausente", caminho: esperado.caminho });
      continue;
    }
    porNome.delete(esperado.caminho);
    if (encontrado.sha256 !== esperado.sha256) {
      problemas.push({
        tipo: "alterado",
        caminho: esperado.caminho,
        esperado: esperado.sha256,
        encontrado: encontrado.sha256,
      });
    }
  }

  for (const sobrando of porNome.keys()) {
    problemas.push({ tipo: "nao_registrado", caminho: sobrando });
  }

  return problemas;
}

export function descreverProblema(problema: ProblemaDoManifesto): string {
  switch (problema.tipo) {
    case "alterado":
      return `alterado: ${problema.caminho} (esperado ${problema.esperado.slice(0, 12)}…, encontrado ${problema.encontrado.slice(0, 12)}…)`;
    case "ausente":
      return `ausente: ${problema.caminho}`;
    case "nao_registrado":
      return `não registrado: ${problema.caminho}`;
  }
}
