#!/usr/bin/env node
// Simula as condições do job de deploy (.github/workflows/deploy.yml) para um
// evento `workflow_run` gravado em JSON. Serve para provar, sem publicar nada,
// que PR, fork, agenda e commit antigo nunca chegam ao passo de aprovação.
//
// Uso: node scripts/simula-deploy-evento.mjs caminho/do/evento.json
// O JSON pode ter `_ponta_da_main` com o SHA atual da main (para o passo
// "Conferir que é a ponta da main"); sem ele, a conferência é dispensada.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Espelha o `if:` do job `deploy`. Cada condição devolve o motivo da recusa. */
export function avaliarJobDeDeploy(evento) {
  const run = evento.workflow_run ?? {};
  const repositorio = evento.repository?.full_name;
  if (run.conclusion !== "success") return { chegaAoJob: false, motivo: "a CI não terminou com sucesso" };
  if (run.event !== "push") return { chegaAoJob: false, motivo: `evento de origem é "${run.event}", não push` };
  if (!repositorio || run.head_repository?.full_name !== repositorio) {
    return { chegaAoJob: false, motivo: "o código vem de outro repositório (fork)" };
  }
  if (run.head_branch !== "main") return { chegaAoJob: false, motivo: "não é a branch main" };
  return { chegaAoJob: true, motivo: "passa as condições do job; espera a aprovação do ambiente production" };
}

/** Espelha o passo "Conferir que é a ponta da main" do deploy.yml. */
export function avaliarPontaDaMain(evento) {
  const ponta = evento._ponta_da_main;
  if (!ponta) return { publica: true, motivo: "ponta da main não informada; conferência dispensada" };
  return evento.workflow_run?.head_sha === ponta
    ? { publica: true, motivo: "é a ponta da main" }
    : { publica: false, motivo: "a main já avançou; um deploy mais novo vem aí" };
}

export function simular(evento) {
  const job = avaliarJobDeDeploy(evento);
  if (!job.chegaAoJob) return { chegaAoJob: false, publica: false, motivo: job.motivo };
  const ponta = avaliarPontaDaMain(evento);
  return { chegaAoJob: true, publica: ponta.publica, motivo: ponta.publica ? job.motivo : ponta.motivo };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arquivo = process.argv[2];
  if (!arquivo) {
    console.error("uso: node scripts/simula-deploy-evento.mjs evento.json");
    process.exit(2);
  }
  const resultado = simular(JSON.parse(readFileSync(arquivo, "utf8")));
  console.log(JSON.stringify(resultado));
  process.exit(resultado.publica ? 0 : 1);
}
