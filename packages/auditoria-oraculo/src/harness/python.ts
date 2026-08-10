/**
 * Execução do oráculo Python.
 *
 * Só é chamado por testes e ferramentas. A ausência de Python não muda nem
 * degrada o caminho produtivo — degrada apenas a capacidade de comparar.
 *
 * `PYTHONDONTWRITEBYTECODE` evita que a execução crie `__pycache__` dentro da
 * cópia; o manifesto continua valendo mesmo depois de rodar o oráculo.
 */
import { spawn } from "node:child_process";
import path from "node:path";

import { versaoDoPythonDoOraculo } from "../oraculo.ts";
import type { WorkspaceDeExecucao } from "./workspace.ts";

export type SaidaDoProcesso = {
  codigo: number;
  stdout: string;
  stderr: string;
};

function executar(
  comando: string,
  argumentos: string[],
  diretorio: string,
): Promise<SaidaDoProcesso> {
  return new Promise((resolve, reject) => {
    const processo = spawn(comando, argumentos, {
      cwd: diretorio,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
    });

    let stdout = "";
    let stderr = "";
    processo.stdout.on("data", (pedaco: Buffer) => (stdout += pedaco.toString()));
    processo.stderr.on("data", (pedaco: Buffer) => (stderr += pedaco.toString()));
    processo.on("error", reject);
    processo.on("close", (codigo) => resolve({ codigo: codigo ?? -1, stdout, stderr }));
  });
}

export async function versaoDoPythonInstalado(): Promise<string | undefined> {
  try {
    const { codigo, stdout, stderr } = await executar(
      "python3",
      ["--version"],
      process.cwd(),
    );
    if (codigo !== 0) return undefined;
    return `${stdout}${stderr}`.trim().replace(/^Python\s+/, "");
  } catch {
    return undefined;
  }
}

export async function pythonEstaNaVersaoFixada(): Promise<boolean> {
  return (await versaoDoPythonInstalado()) === versaoDoPythonDoOraculo;
}

/** Roda um script dos assets da skill copiada, a partir do workspace. */
export function executarScriptDoOraculo(
  workspace: WorkspaceDeExecucao,
  script: string,
  argumentos: string[] = [],
): Promise<SaidaDoProcesso> {
  const assets = path.join(workspace.skill, "assets");
  return executar("python3", [path.join(assets, script), ...argumentos], assets);
}

/**
 * O oráculo prova a si mesmo antes de servir de referência: se `teste_regressao`
 * não fechar os MD5 do golden Santa Tereza, comparar TypeScript contra ele não
 * significa nada.
 */
export async function oraculoReproduzOGolden(
  workspace: WorkspaceDeExecucao,
): Promise<{ ok: boolean; saida: string }> {
  const { codigo, stdout, stderr } = await executarScriptDoOraculo(
    workspace,
    "teste_regressao.py",
  );

  return { ok: codigo === 0, saida: `${stdout}${stderr}`.trim() };
}
