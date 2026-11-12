#!/usr/bin/env node
// Gera a configuração local do proxy de CLI (CLIProxyAPI) e as variáveis que a API usa
// para falar com ele. Roda uma vez por máquina; não sobrescreve o que já existe.
//
//   node scripts/cliproxy-config.mjs
//
// Escreve `.local/cliproxy/config.yaml` (ignorado pelo git) com DUAS chaves aleatórias:
// a de gerenciamento (login e lista de contas) e a de cliente (uso dos modelos). As duas
// também entram no `.env` como CLIPROXY_MANAGEMENT_KEY e CLIPROXY_API_KEY. Nenhuma é
// impressa. Para trocar as chaves, apague o config.yaml e as duas linhas do `.env`.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pasta = path.join(raiz, ".local", "cliproxy");
const arquivo = path.join(pasta, "config.yaml");
const env = path.join(raiz, ".env");

if (existsSync(arquivo)) {
  console.log("cliproxy-config: já existe .local/cliproxy/config.yaml; nada foi alterado.");
  process.exit(0);
}
if (!existsSync(env)) {
  console.error("cliproxy-config: não achei o .env na raiz; crie-o a partir do .env.example primeiro.");
  process.exit(1);
}

const chaveDeGerenciamento = randomBytes(32).toString("hex");
const chaveDeCliente = randomBytes(32).toString("hex");

mkdirSync(pasta, { recursive: true });
writeFileSync(
  arquivo,
  `# Gerado por scripts/cliproxy-config.mjs. Contém segredos: não versionar nem compartilhar.
server:
  host: ""            # todas as interfaces DENTRO do contêiner; a porta só é publicada em 127.0.0.1
  port: 8317

management:
  # Necessário porque, atrás da porta publicada, o proxy enxerga o gateway do Docker.
  # A proteção é a chave abaixo e a publicação só em 127.0.0.1.
  allow-remote: true
  secret-key: "${chaveDeGerenciamento}"
  disable-control-panel: true

access:
  api-keys:
    - "${chaveDeCliente}"

oauth:
  auth-dir: "/root/.cli-proxy-api"

observability:
  logs:
    debug: false
`,
  { mode: 0o600 },
);

const atual = readFileSync(env, "utf8");
const linhas = [];
if (!/^CLIPROXY_URL=/m.test(atual)) linhas.push("CLIPROXY_URL=http://127.0.0.1:8317");
if (!/^CLIPROXY_MANAGEMENT_KEY=/m.test(atual)) linhas.push(`CLIPROXY_MANAGEMENT_KEY=${chaveDeGerenciamento}`);
if (!/^CLIPROXY_API_KEY=/m.test(atual)) linhas.push(`CLIPROXY_API_KEY=${chaveDeCliente}`);
if (linhas.length > 0) {
  appendFileSync(env, `${atual.endsWith("\n") ? "" : "\n"}\n# Proxy de CLI para Claude e Codex pela assinatura (scripts/cliproxy-config.mjs)\n${linhas.join("\n")}\n`);
}

console.log("cliproxy-config: .local/cliproxy/config.yaml criado e variáveis CLIPROXY_* gravadas no .env (sem exibir as chaves).");
console.log("Próximo passo: docker compose --profile ia-assinatura up -d cliproxy");
