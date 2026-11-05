import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
if (process.platform === "win32") assert.ok(existsSync(bash), "Os testes de deploy exigem o Bash do Git");

// Substituições só nos caminhos fixos. Docker, curl e sleep nunca chegam ao host.
const programa = readFileSync(path.join(root, "ops/deploy.sh"), "utf8")
  .replace('cd /opt/plugga-os', 'cd "$DEPLOY_FIXTURE"')
  .replaceAll('/root/backup-plugga.sh', '"$DEPLOY_BACKUP"')
  .replace('. "$(dirname "${BASH_SOURCE[0]}")/lib-trava.sh"', '. "$DEPLOY_LIB"');

const dockerFalso = String.raw`
evento() { printf '%s\n' "$*" >> "$DEPLOY_LOG"; }
docker() {
  case "$1" in
    image)
      [[ "$DEPLOY_CASO" != imagem-ausente || "$3" != plugga-os-web:anterior ]]
      ;;
    tag)
      if [[ "$2" == *:anterior ]]; then evento "restaura $2"; fi
      ;;
    exec)
      if [[ "$3" == printenv ]]; then printf '%s\n' senha-sintetica
      elif [[ "$3" == psql ]]; then
        evento consulta
        case "$DEPLOY_CASO" in
          consulta-falhou*) return 22 ;;
          negocio-sem-cliente) printf '%s\n' t ;;
          resposta-desconhecida) printf '%s\n' desconhecido ;;
          *) printf '%s\n' f ;;
        esac
      else return 99; fi
      ;;
    compose)
      case "$2" in
        build) evento build; [[ "$DEPLOY_CASO" != build-falhou ]] ;;
        stop) shift 2; evento "stop $*" ;;
        run)
          if [[ "$*" == *db:migrate:deploy* ]]; then evento migrate; [[ "$DEPLOY_CASO" != migrate-falhou ]]
          elif [[ "$*" == *'node --input-type=module'* ]]; then cat > /dev/null; evento permissoes; [[ "$DEPLOY_CASO" != permissoes-falharam ]]
          else return 99; fi
          ;;
        --profile) evento up-nova ;;
        up)
          shift 2; evento "up-comando $*"
          if grep -q '^restaura ' "$DEPLOY_LOG"; then evento up-anterior
          else evento up-atual; fi
          [[ "$DEPLOY_CASO" != consulta-falhou-e-up-atual-falhou ]]
          ;;
        ps) return 0 ;;
        *) return 99 ;;
      esac
      ;;
    *) return 99 ;;
  esac
}
curl() {
  evento smoke
  if [[ "$DEPLOY_CASO" == sucesso ]]; then
    if [[ "$*" == */api/auth/login* ]]; then printf 401; else printf 200; fi
  else printf 500; fi
}
sleep() { :; }
source "$DEPLOY_SCRIPT"
`;

function executar(caso) {
  const pasta = mkdtempSync(path.join(tmpdir(), "plugga-deploy-teste-"));
  const posix = (valor) => valor.replaceAll("\\", "/");
  const script = path.join(pasta, "deploy.sh");
  const backup = path.join(pasta, "backup.sh");
  const log = path.join(pasta, "eventos.log");
  writeFileSync(script, programa);
  mkdirSync(path.join(pasta, "ops"));
  writeFileSync(path.join(pasta, "ops/verificar-permissoes-crm.mjs"), "// Entrada sintética do comando simulado.\n");
  writeFileSync(backup, String.raw`#!/usr/bin/env bash
set -eu
numero=0
[[ ! -f "$DEPLOY_CONTADOR" ]] || numero=$(cat "$DEPLOY_CONTADOR")
numero=$((numero + 1))
printf '%s' "$numero" > "$DEPLOY_CONTADOR"
printf 'backup-%s\n' "$numero" >> "$DEPLOY_LOG"
[[ "$DEPLOY_CASO" != backup-final-falhou || "$numero" != 2 ]]
`, { mode: 0o755 });
  try {
    const resultado = spawnSync(bash, ["--noprofile", "--norc", "-c", dockerFalso], {
      encoding: "utf8", timeout: 10_000,
      env: {
        ...process.env, PLUGGA_DEPLOY_LOCK_HELD: "1", DEPLOY_CASO: caso,
        DEPLOY_FIXTURE: posix(pasta), DEPLOY_SCRIPT: posix(script), DEPLOY_BACKUP: posix(backup),
        DEPLOY_LIB: posix(path.join(root, "ops/lib-trava.sh")), DEPLOY_LOG: posix(log),
        DEPLOY_CONTADOR: posix(path.join(pasta, "contador")),
      },
    });
    assert.ifError(resultado.error);
    return { ...resultado, eventos: existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [] };
  } finally {
    assert.equal(path.dirname(pasta), tmpdir());
    rmSync(pasta, { recursive: true, force: true });
  }
}

test("deploy para só os escritores depois do build, faz backup final e só então migra e sobe", () => {
  const r = executar("sucesso");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.eventos, ["backup-1", "build", "stop api web", "backup-2", "migrate", "permissoes", "up-nova", "smoke", "smoke"]);
});

for (const caso of ["backup-final-falhou", "migrate-falhou", "permissoes-falharam"]) {
  test(`${caso}: erro reativa as imagens anteriores sem restaurar banco nem reiniciar infraestrutura`, () => {
    const r = executar(caso);
    assert.notEqual(r.status, 0);
    assert.ok(r.eventos.includes("backup-2"), r.eventos.join("\n"));
    assert.equal(r.eventos.includes("migrate"), caso !== "backup-final-falhou");
    assert.equal(r.eventos.includes("permissoes"), caso === "permissoes-falharam");
    assert.ok(r.eventos.includes("consulta"));
    assert.ok(r.eventos.includes("up-anterior"));
    assert.ok(r.eventos.includes("up-comando -d --no-deps --no-build api web"));
    assert.equal(r.eventos.includes("up-nova"), false);
    assert.match(r.stderr, /BANCO NÃO FOI REVERTIDO/);
  });
}

test("smoke falha: interrompe escritores antes de conferir a compatibilidade do rollback", () => {
  const r = executar("smoke-falhou");
  assert.notEqual(r.status, 0);
  const smoke = r.eventos.lastIndexOf("smoke");
  assert.deepEqual(r.eventos.slice(smoke + 1), [
    "stop api web", "consulta", "restaura plugga-os-api:anterior", "restaura plugga-os-web:anterior",
    "up-comando -d --no-deps --no-build api web", "up-anterior",
  ]);
});

for (const caso of ["negocio-sem-cliente", "consulta-falhou", "resposta-desconhecida", "imagem-ausente"]) {
  test(`${caso}: recusa imagens antigas, tenta manter a versão atual e exige intervenção`, () => {
    const r = executar(caso);
    assert.notEqual(r.status, 0);
    assert.ok(r.eventos.includes("consulta"));
    assert.equal(r.eventos.some((evento) => evento.startsWith("restaura ")), false);
    assert.ok(r.eventos.includes("up-atual"));
    assert.ok(r.eventos.includes("up-comando -d --no-deps --no-build api web"));
    assert.match(r.stderr, /intervenção/i);
  });
}

test("falha ao reativar a versão atual exige intervenção sem repetir o trap ou tentar outra imagem", () => {
  const r = executar("consulta-falhou-e-up-atual-falhou");
  assert.notEqual(r.status, 0);
  assert.equal(r.eventos.filter((evento) => evento === "up-atual").length, 1);
  assert.equal(r.eventos.some((evento) => evento.startsWith("restaura ")), false);
  assert.match(r.stderr, /versão atual também não subiu/);
  assert.match(r.stderr, /reativação manual necessária/);
});

test("build recusado preserva a aplicação em execução, sem parar serviços nem migrar", () => {
  const r = executar("build-falhou");
  assert.notEqual(r.status, 0);
  assert.deepEqual(r.eventos, ["backup-1", "build"]);
});
