import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { simular } from "./simula-deploy-evento.mjs";

const fixture = (nome) => JSON.parse(readFileSync(new URL(`./fixtures/${nome}`, import.meta.url), "utf8"));
const deployYml = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");

test("PR de fork nunca chega ao job de deploy", () => {
  const r = simular(fixture("workflow_run_pr_fork_main.json"));
  assert.equal(r.chegaAoJob, false);
  assert.equal(r.publica, false);
});

test("push na main oficial chega ao passo de aprovação e publica", () => {
  const r = simular(fixture("workflow_run_push_main.json"));
  assert.equal(r.chegaAoJob, true);
  assert.equal(r.publica, true);
});

test("push antigo, com a main já adiante, chega ao job mas não publica", () => {
  const r = simular(fixture("workflow_run_push_sha_antigo.json"));
  assert.equal(r.chegaAoJob, true);
  assert.equal(r.publica, false);
  assert.match(r.motivo, /main já avançou/);
});

test("PR de dentro do repositório, agenda e disparo manual também não chegam", () => {
  for (const event of ["pull_request", "schedule", "workflow_dispatch"]) {
    const e = fixture("workflow_run_push_main.json");
    e.workflow_run.event = event;
    assert.equal(simular(e).chegaAoJob, false, event);
  }
});

test("CI vermelha, branch diferente de main e fork com evento push não chegam", () => {
  const vermelha = fixture("workflow_run_push_main.json");
  vermelha.workflow_run.conclusion = "failure";
  assert.equal(simular(vermelha).chegaAoJob, false);

  const outraBranch = fixture("workflow_run_push_main.json");
  outraBranch.workflow_run.head_branch = "feat/x";
  assert.equal(simular(outraBranch).chegaAoJob, false);

  const fork = fixture("workflow_run_push_main.json");
  fork.workflow_run.head_repository.full_name = "forasteiro/plugga-os";
  assert.equal(simular(fork).chegaAoJob, false);
});

// O simulador só vale se continuar igual ao workflow real.
test("o deploy.yml tem as mesmas condições que o simulador avalia", () => {
  for (const trecho of [
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.head_repository.full_name == github.repository",
    "github.event.workflow_run.head_branch == 'main'",
    "environment: production",
    "cancel-in-progress: false",
    "timeout-minutes: 20",
    "contents: read",
    "steps.ponta.outputs.publicar == 'true'",
  ]) {
    assert.ok(deployYml.includes(trecho), `deploy.yml perdeu: ${trecho}`);
  }
});
