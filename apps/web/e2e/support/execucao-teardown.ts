import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { RUN_ID_VALIDO } from "./execucao";

/** Só o banco local (Docker Compose) ou o da CI. A produção nunca chega aqui. */
const HOSTS = new Set(["127.0.0.1", "localhost"]);
const PORTAS = new Set(["55432", "55433"]);
// O Playwright carrega este arquivo como CommonJS: __dirname, não import.meta.
const SQL = path.join(__dirname, "limpeza-e2e.sql");
const RAIZ = path.resolve(__dirname, "../../../..");

/**
 * globalTeardown: apaga o que esta execução criou, pelo runId, com o papel dono
 * do banco em `E2E_CLEANUP_DATABASE_URL`. Sem a variável, não faz nada (a CI
 * descarta o banco). Usa o `psql` da máquina quando existe (a CI); senão, o do
 * container `postgres` do Docker Compose (a máquina do André), pela porta de dentro.
 */
export default function limparExecucao(): void {
  const url = process.env.E2E_CLEANUP_DATABASE_URL;
  const run = process.env.E2E_RUN_ID;
  if (!url) return;
  if (!run || !RUN_ID_VALIDO.test(run)) throw new Error("limpeza dos e2e: E2E_RUN_ID ausente ou inválido");

  let alvo: URL;
  try { alvo = new URL(url); } catch { throw new Error("limpeza dos e2e: E2E_CLEANUP_DATABASE_URL inválida"); }
  if (!HOSTS.has(alvo.hostname) || !PORTAS.has(alvo.port)) {
    throw new Error(`limpeza dos e2e recusada: só 127.0.0.1/localhost nas portas 55432 ou 55433 (recebido ${alvo.hostname}:${alvo.port})`);
  }

  // A URL do Prisma traz `?schema=public`, que o psql não aceita. A senha sai da URL
  // e vai pelo PGPASSWORD, para não aparecer na lista de processos da máquina.
  alvo.search = "";
  const senha = decodeURIComponent(alvo.password);
  alvo.password = "";
  const ambiente = { ...process.env, PGPASSWORD: senha };
  const argumentos = (conexao: string, arquivo: string) => [conexao, "-v", "ON_ERROR_STOP=1", "-v", `run=${run}`, "-v", "limpeza_permitida=sim", "-1", "-q", "-t", "-A", "-f", arquivo];
  const temPsql = spawnSync("psql", ["--version"], { stdio: "ignore" }).status === 0;
  let resultado;
  if (temPsql) {
    resultado = spawnSync("psql", argumentos(alvo.toString(), SQL), { encoding: "utf8", env: ambiente });
  } else {
    // Sem psql na máquina, só o banco do dev: o serviço `postgres` do compose.yaml da
    // raiz é o da porta 55432. A 55433 (banco de teste) é de outro compose: recusa.
    if (alvo.port !== "55432") throw new Error("limpeza dos e2e recusada: sem psql na máquina, só o banco do dev (porta 55432) pelo container do Compose");
    // Dentro do container o Postgres escuta na 5432; o SQL vai pela entrada padrão.
    const dentro = new URL(alvo);
    dentro.hostname = "127.0.0.1";
    dentro.port = "5432";
    resultado = spawnSync("docker", ["compose", "exec", "-T", "-e", "PGPASSWORD", "postgres", "psql", ...argumentos(dentro.toString(), "-")],
      { cwd: RAIZ, encoding: "utf8", env: ambiente, input: readFileSync(SQL, "utf8") });
  }
  if (resultado.error) throw new Error(`limpeza dos e2e: não foi possível chamar o psql (${resultado.error.message})`);
  if (resultado.status !== 0) throw new Error(`limpeza dos e2e falhou: ${(resultado.stderr || resultado.stdout || "").trim().split("\n").slice(-3).join(" ")}`);

  // Última linha: o que foi apagado, na ordem das colunas do SELECT final de limpeza-e2e.sql.
  const ROTULOS = ["lançamentos", "pedidos", "ordens de serviço", "tarefas", "usinas", "itens de estoque", "fornecedores"];
  const contagens = resultado.stdout.trim().split("\n").at(-1)?.split("|") ?? [];
  if (contagens.length === ROTULOS.length) {
    console.log(`[e2e] limpeza da execução ${run}: ${contagens.map((n, i) => `${n} ${ROTULOS[i]}`).join(", ")}.`);
  } else {
    console.warn(`[e2e] limpeza da execução ${run}: contagens fora do formato (${contagens.length} colunas, esperadas ${ROTULOS.length}).`);
  }
}
