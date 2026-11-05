import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { conferirArmazenamentoAtual } from "../ops/preflight-storage-api.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const ambiente = {
  STORAGE_ENDPOINT: "http://rustfs:9000",
  STORAGE_ACCESS_KEY: "chave-sintetica",
  STORAGE_SECRET_KEY: "segredo-sintetico",
};

function sonda({ pronta = true, erroHttp, erroS3 } = {}) {
  const chamadas = [];
  class HeadBucketCommand {
    constructor(input) { this.input = input; }
  }
  class S3Client {
    constructor(config) { chamadas.push({ tipo: "cliente", config }); }
    async send(comando, opcoes) {
      chamadas.push({ tipo: "s3", comando, opcoes });
      assert.ok(comando instanceof HeadBucketCommand, "nenhuma operação de escrita é permitida");
      if (erroS3) throw erroS3;
      return {};
    }
    destroy() { chamadas.push({ tipo: "destroy" }); }
  }
  return {
    chamadas,
    dependencias: {
      S3Client,
      HeadBucketCommand,
      fetch: async (url, opcoes) => {
        chamadas.push({ tipo: "http", url, opcoes });
        if (erroHttp) throw erroHttp;
        return { ok: pronta };
      },
    },
  };
}

test("configuração ausente, SeaweedFS e endpoints diferentes bloqueiam antes de consultar a rede", async () => {
  for (const alteracao of [
    { STORAGE_ENDPOINT: undefined },
    { STORAGE_ENDPOINT: "http://seaweedfs:8333" },
    { STORAGE_ENDPOINT: "http://outro-rustfs:9000" },
    { STORAGE_ENDPOINT: "http://rustfs:8333" },
    { STORAGE_ENDPOINT: "http://usuario:senha@rustfs:9000" },
    { STORAGE_ENDPOINT: "http://rustfs:9000/objetos" },
    { STORAGE_ACCESS_KEY: undefined },
    { STORAGE_SECRET_KEY: " " },
  ]) {
    const { chamadas, dependencias } = sonda();
    await assert.rejects(conferirArmazenamentoAtual({ ...ambiente, ...alteracao }, dependencias), /bloqueada/);
    assert.deepEqual(chamadas, []);
  }
});

test("RustFS atual saudável consulta somente readiness e HEAD do balde legado, sem exigir o balde novo", async () => {
  const { chamadas, dependencias } = sonda();
  await conferirArmazenamentoAtual(ambiente, dependencias);
  assert.deepEqual(chamadas.map((chamada) => chamada.tipo), ["http", "cliente", "s3", "destroy"]);
  assert.equal(chamadas[0].url, "http://rustfs:9000/health/ready");
  assert.equal(chamadas[0].opcoes.method, "GET");
  assert.equal(chamadas[0].opcoes.redirect, "error");
  assert.ok(chamadas[0].opcoes.signal instanceof AbortSignal);
  assert.equal(chamadas[1].config.endpoint, ambiente.STORAGE_ENDPOINT);
  assert.equal(chamadas[1].config.maxAttempts, 1);
  assert.equal(chamadas[1].config.forcePathStyle, true);
  assert.deepEqual(chamadas[2].comando.input, { Bucket: "plugga-energia-opm" });
  assert.ok(chamadas[2].opcoes.abortSignal instanceof AbortSignal);
});

test("readiness e credenciais sem acesso ao balde falham sem expor erros do provedor", async () => {
  for (const opcoes of [
    { pronta: false },
    { erroHttp: new Error("URL-com-credencial-privada") },
    { erroS3: new Error("chave-privada/arquivo-cliente.pdf") },
  ]) {
    const { chamadas, dependencias } = sonda(opcoes);
    await assert.rejects(conferirArmazenamentoAtual(ambiente, dependencias), (erro) => {
      assert.match(erro.message, /Publicação bloqueada/);
      assert.doesNotMatch(erro.message, /privada|arquivo-cliente/);
      return true;
    });
    if (opcoes.erroS3) assert.equal(chamadas.at(-1).tipo, "destroy");
    else assert.equal(chamadas.some((chamada) => chamada.tipo === "s3"), false);
  }
});

const bash = process.platform === "win32"
  ? "C:/Program Files/Git/bin/bash.exe"
  : "bash";
if (process.platform === "win32") assert.ok(existsSync(bash), "Os testes de deploy exigem o Bash do Git");

// Função local substitui inteiramente o Docker: qualquer comando não previsto falha.
const dockerFalso = String.raw`
docker() {
  printf '%s\n' "$*" >> "$PREFLIGHT_LOG"
  [[ "$PREFLIGHT_CASO" != docker-indisponivel ]] || return 1
  case "$1" in
    ps)
      if [[ "$*" == *com.docker.compose.service=api* ]]; then
        [[ "$PREFLIGHT_CASO" != api-ausente ]] || return 0
        printf '%s\n' aaaaaaaa
        [[ "$PREFLIGHT_CASO" != api-duplicada ]] || printf '%s\n' bbbbbbbb
      else
        [[ "$PREFLIGHT_CASO" != rustfs-ausente ]] || return 0
        printf '%s\n' cccccccc
      fi
      ;;
    inspect)
      if [[ "$3" == *Config.Labels* ]]; then
        if [[ "$4" == aaaaaaaa ]]; then
          if [[ "$PREFLIGHT_CASO" == api-parada ]]; then printf '%s\n' 'plugga-os|api|exited'
          else printf '%s\n' 'plugga-os|api|running'; fi
        elif [[ "$PREFLIGHT_CASO" == projeto-divergente ]]; then printf '%s\n' 'outro-projeto|rustfs|running'
        else printf '%s\n' 'plugga-os|rustfs|running'; fi
      elif [[ "$3" == *State.Health* ]]; then
        if [[ "$PREFLIGHT_CASO" == sem-saude ]]; then printf '%s\n' starting
        else printf '%s\n' healthy; fi
      elif [[ "$3" == *Mounts* ]]; then
        case "$PREFLIGHT_CASO" in
          outro-volume) printf '%s\n' 'volume|outro_rustfs_data' ;;
          bind) printf '%s\n' 'bind|' ;;
          sem-data) printf '' ;;
          *) printf '%s\n' 'volume|plugga-os_rustfs_data' ;;
        esac
      else return 98; fi
      ;;
    exec)
      cat > /dev/null
      [[ "$PREFLIGHT_CASO" != probe-falhou ]]
      ;;
    *) return 99 ;;
  esac
}
source "$PREFLIGHT_SCRIPT"
`;

function executarComDockerFalso(caso) {
  const pasta = mkdtempSync(path.join(tmpdir(), "preflight-storage-"));
  const log = path.join(pasta, "docker.log");
  try {
    const resultado = spawnSync(bash, ["--noprofile", "--norc", "-c", dockerFalso], {
      encoding: "utf8",
      timeout: 10_000,
      env: {
        ...process.env,
        PREFLIGHT_CASO: caso,
        PREFLIGHT_LOG: log.replaceAll("\\", "/"),
        PREFLIGHT_SCRIPT: path.join(root, "ops/preflight-storage-publicacao.sh").replaceAll("\\", "/"),
      },
    });
    assert.ifError(resultado.error);
    return { ...resultado, chamadas: existsSync(log) ? readFileSync(log, "utf8") : "" };
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

test("containers ausentes, duplicados, de outro projeto, sem saúde ou em outro volume bloqueiam sem executar a API", () => {
  for (const caso of ["docker-indisponivel", "api-ausente", "api-duplicada", "api-parada", "rustfs-ausente", "projeto-divergente", "sem-saude", "outro-volume", "bind", "sem-data"]) {
    const r = executarComDockerFalso(caso);
    assert.notEqual(r.status, 0, caso);
    assert.match(r.stderr, /Publicação bloqueada/, caso);
    assert.doesNotMatch(r.chamadas, /^exec /m, caso);
  }
});

test("volume atual correto permite somente inspeção e probe dentro da API; falha do probe interrompe", () => {
  for (const caso of ["valido", "probe-falhou"]) {
    const r = executarComDockerFalso(caso);
    assert.equal(r.status, caso === "valido" ? 0 : 1, r.stderr);
    const chamadas = r.chamadas.trim().split("\n");
    assert.ok(chamadas.every((linha) => /^(ps |inspect |exec )/.test(linha)));
    assert.match(chamadas.at(-1), /^exec -i --workdir \/app\/apps\/api aaaaaaaa node --input-type=module - --preflight-storage-publicacao$/);
    assert.match(r.chamadas, /com.docker.compose.project=plugga-os/);
    assert.doesNotMatch(r.chamadas, /compose |volume create|stop |start |PUT|DELETE|segredo|chave-sintetica/);
  }
});

test("workflow executa a conferência do checkout antes do rsync e só quando publicar", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/deploy.yml"), "utf8");
  const guard = workflow.indexOf("- name: Conferir armazenamento antes da publicação");
  assert.ok(guard > workflow.indexOf("id: ponta"));
  assert.ok(guard < workflow.indexOf("- name: Sincronizar para /opt/plugga-os"));
  assert.match(workflow.slice(guard, workflow.indexOf("- name: Sincronizar para /opt/plugga-os")), /if: steps\.ponta\.outputs\.publicar == 'true'[\s\S]*run: sudo bash ops\/preflight-storage-publicacao\.sh/);
});
