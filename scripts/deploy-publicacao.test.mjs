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
  .replaceAll('/opt/plugga-os/.env', '"$DEPLOY_FIXTURE/.env"')
  .replace('cd /opt/plugga-os', 'cd "$DEPLOY_FIXTURE"')
  .replaceAll('/root/backup-plugga.sh', '"$DEPLOY_BACKUP"');

// Os casos "rls-*" são a primeira publicação com o RLS: antes de migrar o banco não
// tem a 20261106010000; depois, tem. Nos outros, o banco já a tinha.
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
      shift
      [[ "$1" != -i ]] || shift
      local conteiner=$1; shift
      if [[ "$1" == printenv ]]; then printf '%s\n' senha-sintetica
      elif [[ "$1" == pg_isready ]]; then [[ "$DEPLOY_CASO" != banco-fora ]]
      elif [[ "$1" == sh ]]; then
        cat > /dev/null; evento conecta
      elif [[ "$1" == psql ]]; then
        if [[ "$*" == *'-v runtime='* ]]; then
          cat > /dev/null; evento preflight
          [[ "$DEPLOY_CASO" != preflight-reprovou ]] || printf '%s\n' 'runtime|o login plugga_rt_app tem permissão direta antiga em tabela, sequência ou view (use um login novo)'
        elif [[ "$*" == *'-v runtime_role='* ]]; then
          cat > /dev/null; evento papeis; [[ "$DEPLOY_CASO" != papeis-falharam ]]
        elif [[ "$*" == *_prisma_migrations* ]]; then
          # O banco cai depois da migração: a consulta da mensagem de falha não responde.
          if [[ "$DEPLOY_CASO" == rls-banco-caiu* ]] && grep -q '^migrate$' "$DEPLOY_LOG"; then return 2; fi
          if [[ "$DEPLOY_CASO" == rls-* ]] && ! grep -q '^migrate$' "$DEPLOY_LOG"; then printf '0\n'; else printf '1\n'; fi
          grep -q '^isolamento$' "$DEPLOY_LOG" || evento isolamento
        else
          evento consulta
          case "$DEPLOY_CASO" in
            consulta-falhou*) return 22 ;;
            negocio-sem-cliente) printf '%s\n' t ;;
            resposta-desconhecida) printf '%s\n' desconhecido ;;
            *) printf '%s\n' f ;;
          esac
        fi
      else return 99; fi
      ;;
    compose)
      case "$2" in
        build) evento build; [[ "$DEPLOY_CASO" != build-falhou ]] ;;
        stop) shift 2; evento "stop $*" ;;
        run)
          if [[ "$*" == *db:migrate:deploy* ]]; then evento migrate; [[ "$DEPLOY_CASO" != migrate-falhou ]]
          elif [[ "$*" == *'--verificar-permissoes-crm'* ]]; then cat > /dev/null; evento permissoes; [[ "$DEPLOY_CASO" != permissoes-falharam ]]
          elif [[ "$*" == *'node --input-type=module'* ]]; then cat > /dev/null; evento pools; [[ "$DEPLOY_CASO" != *pools-reprovaram ]]
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
source "$DEPLOY_SCRIPT" $DEPLOY_ARGS
`;

function executar(caso, argumentos = "") {
  const pasta = mkdtempSync(path.join(tmpdir(), "plugga-deploy-teste-"));
  const posix = (valor) => valor.replaceAll("\\", "/");
  const script = path.join(pasta, "deploy.sh");
  const backup = path.join(pasta, "backup.sh");
  const log = path.join(pasta, "eventos.log");
  writeFileSync(script, programa);
  // O deploy.sh carrega as bibliotecas da própria pasta.
  for (const lib of ["lib-trava.sh", "lib-papeis.sh"]) writeFileSync(path.join(pasta, lib), readFileSync(path.join(root, "ops", lib), "utf8"));
  // Três logins sintéticos, como o .env da VPS depois do passo a passo do GUIA.
  writeFileSync(path.join(pasta, ".env"), [
    "APP_DB_USER=plugga_rt_app", "APP_DB_PASSWORD=senha-sintetica-rt",
    "AUTH_DATABASE_URL=postgresql://plugga_auth_app:senha-sintetica-auth@postgres:5432/plugga_os?schema=public",
    "JOBS_DATABASE_URL=postgresql://plugga_jobs_app:senha-sintetica-jobs@postgres:5432/plugga_os?schema=public", "",
  ].join("\n"));
  mkdirSync(path.join(pasta, "ops"));
  for (const arquivo of ["verificar-permissoes-crm.mjs", "verificar-pools-do-banco.mjs", "configurar-papeis-aplicacao.sql"]) {
    writeFileSync(path.join(pasta, "ops", arquivo), "-- Entrada sintética do comando simulado.\n");
  }
  writeFileSync(backup, String.raw`#!/usr/bin/env bash
set -eu
numero=0
[[ ! -f "$DEPLOY_CONTADOR" ]] || numero=$(cat "$DEPLOY_CONTADOR")
numero=$((numero + 1))
printf '%s' "$numero" > "$DEPLOY_CONTADOR"
printf 'backup-%s\n' "$numero" >> "$DEPLOY_LOG"
[[ "$DEPLOY_CASO" != *backup-final-falhou || "$numero" != 2 ]]
`, { mode: 0o755 });
  try {
    const resultado = spawnSync(bash, ["--noprofile", "--norc", "-c", dockerFalso], {
      encoding: "utf8", timeout: 10_000,
      env: {
        ...process.env, PLUGGA_DEPLOY_LOCK_HELD: "1", DEPLOY_CASO: caso, DEPLOY_ARGS: argumentos,
        DEPLOY_FIXTURE: posix(pasta), DEPLOY_SCRIPT: posix(script), DEPLOY_BACKUP: posix(backup),
        DEPLOY_LOG: posix(log), DEPLOY_CONTADOR: posix(path.join(pasta, "contador")),
      },
    });
    assert.ifError(resultado.error);
    return { ...resultado, eventos: existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [] };
  } finally {
    assert.equal(path.dirname(pasta), tmpdir());
    rmSync(pasta, { recursive: true, force: true });
  }
}

// O passo 0: a consulta dos problemas, as três conexões e o estado do RLS no banco.
const PREFLIGHT = ["preflight", "conecta", "conecta", "conecta", "isolamento"];

test("deploy confere os logins, para só os escritores depois do build, faz backup final, migra, configura os papéis, confere os pools e só então sobe", () => {
  const r = executar("sucesso");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.eventos, [...PREFLIGHT, "backup-1", "build", "stop api web", "backup-2", "migrate", "papeis", "permissoes", "pools", "up-nova", "smoke", "smoke"]);
  for (const senha of ["senha-sintetica-rt", "senha-sintetica-auth", "senha-sintetica-jobs"]) {
    assert.equal(`${r.stdout}${r.stderr}`.includes(senha), false, "o deploy imprimiu uma senha");
  }
});

test("--so-conferir: só confere os logins e sai, sem backup, build, parada nem migração", () => {
  const r = executar("sucesso", "--so-conferir");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.eventos, PREFLIGHT);
  assert.match(r.stdout, /conferência ok/);
});

for (const [caso, mensagem] of [["preflight-reprovou", /permissão direta antiga/], ["banco-fora", /não está respondendo/]]) {
  test(`${caso}: o deploy para antes de qualquer passo, sem tocar em nada, e diz o que falta`, () => {
    const r = executar(caso);
    assert.notEqual(r.status, 0);
    assert.equal(r.eventos.some((evento) => /^(backup|build|stop|migrate|up)/.test(evento)), false, r.eventos.join("\n"));
    assert.match(r.stderr, mensagem);
    assert.match(r.stderr, /nada foi alterado/);
  });
}

for (const caso of ["rls-smoke-falhou", "rls-pools-reprovaram", "rls-backup-final-falhou"]) {
  test(`${caso}: na publicação que liga o RLS, não religa a versão antiga (o .env já tem os logins novos); para e avisa`, () => {
    const r = executar(caso);
    assert.notEqual(r.status, 0);
    assert.equal(r.eventos.includes("migrate"), caso !== "rls-backup-final-falhou");
    assert.equal(r.eventos.some((evento) => evento.startsWith("restaura ")), false, r.eventos.join("\n"));
    // A versão nova só subiu se a falha foi no teste de fumaça; nenhuma volta de versão depois.
    assert.equal(r.eventos.includes("up-nova"), caso === "rls-smoke-falhou");
    assert.equal(r.eventos.some((evento) => evento === "up-anterior" || evento === "up-atual" || evento.startsWith("up-comando")), false, r.eventos.join("\n"));
    assert.equal(r.eventos.at(-1), "stop api web");
    assert.match(r.stderr, /NÃO foi reativada/);
    assert.match(r.stderr, /\.env\.antes-rls/);
    // A mensagem diz se há banco a restaurar.
    assert.match(r.stderr, caso === "rls-backup-final-falhou" ? /ainda NÃO recebeu o RLS/ : /JÁ recebeu o RLS.*backup final/);
  });
}

test("rls-banco-caiu: sem resposta do banco na falha, não afirma que o banco não migrou; manda conferir", () => {
  const r = executar("rls-banco-caiu-pools-reprovaram");
  assert.notEqual(r.status, 0);
  assert.equal(r.eventos.some((evento) => evento.startsWith("restaura ") || evento === "up-anterior" || evento === "up-atual"), false, r.eventos.join("\n"));
  assert.equal(r.eventos.at(-1), "stop api web");
  assert.match(r.stderr, /Não foi possível saber se o banco recebeu o RLS/);
  assert.doesNotMatch(r.stderr, /ainda NÃO recebeu o RLS/);
});

test("pools reprovados numa publicação comum (o banco já tinha o RLS): segue a reversão de hoje", () => {
  const r = executar("pools-reprovaram");
  assert.notEqual(r.status, 0);
  assert.equal(r.eventos.includes("up-nova"), false);
  assert.ok(r.eventos.includes("consulta"));
  assert.ok(r.eventos.includes("up-anterior"));
  assert.match(r.stderr, /BANCO NÃO FOI REVERTIDO/);
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
  assert.deepEqual(r.eventos, [...PREFLIGHT, "backup-1", "build"]);
});
