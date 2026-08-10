/**
 * Workspace isolado por execução.
 *
 * Duas execuções nunca compartilham arquivos: o oráculo escreve resultados
 * intermediários ao lado dos casos, e dois estudos rodando juntos misturariam
 * saídas. Cada execução ganha uma cópia própria da skill e um destino separado
 * para Python e TypeScript.
 *
 * A árvore congelada nunca é o diretório de trabalho — ela é só a origem da
 * cópia.
 */
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { caminhosDoOraculo, raizDaReferencia } from "../oraculo.ts";

export type WorkspaceDeExecucao = {
  raiz: string;
  /** Cópia da skill: assets, casos, templates e references. */
  skill: string;
  /** Bundle de entrada materializado para os dois lados. */
  entrada: string;
  saidaPython: string;
  saidaTypeScript: string;
  descartar(): Promise<void>;
};

export async function criarWorkspace(
  rotulo = "execucao",
): Promise<WorkspaceDeExecucao> {
  const raiz = await mkdtemp(path.join(tmpdir(), `auditoria-${rotulo}-`));
  const skill = path.join(raiz, caminhosDoOraculo.skill);

  await cp(path.join(raizDaReferencia, caminhosDoOraculo.skill), skill, {
    recursive: true,
  });

  const entrada = path.join(raiz, "entrada");
  const saidaPython = path.join(raiz, "saida-python");
  const saidaTypeScript = path.join(raiz, "saida-typescript");
  await Promise.all(
    [entrada, saidaPython, saidaTypeScript].map((dir) =>
      mkdir(dir, { recursive: true }),
    ),
  );

  return {
    raiz,
    skill,
    entrada,
    saidaPython,
    saidaTypeScript,
    descartar: () => rm(raiz, { recursive: true, force: true }),
  };
}

async function arquivosDe(raiz: string, relativo = ""): Promise<string[]> {
  const entradas = await readdir(path.join(raiz, relativo), {
    withFileTypes: true,
  });
  const encontrados: string[] = [];

  for (const entrada of entradas) {
    const caminho = relativo ? `${relativo}/${entrada.name}` : entrada.name;
    if (entrada.isDirectory()) encontrados.push(...(await arquivosDe(raiz, caminho)));
    else if (entrada.isFile()) encontrados.push(caminho);
  }

  return encontrados.sort();
}

/**
 * Hash do bundle de entrada, calculado antes das duas execuções e anexado ao
 * diff. É ele que prova que os dois lados receberam a mesma coisa.
 */
export async function hashDoBundle(diretorio: string): Promise<string> {
  const resumo = createHash("sha256");

  for (const caminho of await arquivosDe(diretorio)) {
    const conteudo = await readFile(path.join(diretorio, caminho));
    resumo.update(caminho);
    resumo.update(createHash("sha256").update(conteudo).digest());
  }

  return resumo.digest("hex");
}
