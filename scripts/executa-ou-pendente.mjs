#!/usr/bin/env node
// Atalho dos scripts de verificação da spec 002 que ainda não existem (T010).
// Uso: node scripts/executa-ou-pendente.mjs <tarefa> <arquivo> [args...]
// Se o arquivo existe, roda `node <arquivo> [args]` e devolve o código dele.
// Se não existe, falha com uma mensagem clara dizendo qual tarefa o cria,
// para um script "verde" nunca esconder que ainda não há verificação.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [tarefa, arquivo, ...args] = process.argv.slice(2);

if (!tarefa || !arquivo) {
  console.error("uso: node scripts/executa-ou-pendente.mjs <tarefa> <arquivo> [args...]");
  process.exit(2);
}

const alvo = path.resolve(raiz, arquivo);
if (!existsSync(alvo)) {
  console.error(
    `✗ Verificação pendente: ${arquivo} ainda não existe. Ela é criada pela tarefa ${tarefa} ` +
      "(specs/002-fundacao-solida/tasks.md). Até lá este comando falha de propósito.",
  );
  process.exit(1);
}

const resultado = spawnSync(process.execPath, [alvo, ...args], { stdio: "inherit", cwd: raiz });
process.exit(resultado.status ?? 1);
