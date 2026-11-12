#!/usr/bin/env node
// Verificação estática (T085, FR da US6): um adaptador sob apps/api/src que fala
// com a rede externa precisa passar pelo IntegrationGate, ou estar na lista de
// exceções abaixo, que é a do ADR-0014. Pega o caso de alguém acrescentar um
// `fetch` num adaptador novo e esquecer o modo da integração.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PADROES_DE_REDE = [
  /(?<![\w.])fetch\s*\(/,
  /from\s+["'](?:axios|got|undici|node-fetch|ky|superagent|nodemailer)["']/,
  /from\s+["'](?:node:)?https?["']/,
];

/** Arquivos que falam com a rede sem chamar o gate, cada um com o motivo. Ver ADR-0014. */
export const EXCECOES = {
  "email/brevo-email.adapter.ts":
    "E-mail transacional fica fora do modelo de modo; o isolamento em desenvolvimento é Mailpit atrás do EmailPort (ADR-0010, ADR-0014).",
  "cadastro/brasilapi.adapter.ts":
    "Consulta pública de CNPJ e CEP: só leitura, sem credencial. O liga/desliga da plataforma é aplicado por ConsultaCadastralService antes de qualquer chamada; o modo mock/leitura/escrita não se aplica a dado público (ADR-0014).",
  "google-calendar/google-calendar-http.adapter.ts":
    "Agenda do Google de cada pessoa: só chama o Google quando a plataforma cadastrou o app OAuth no cofre e a própria pessoa conectou a conta. O modo de integração é global e não vale para uma conexão pessoal; o isolamento em teste é o adaptador falso atrás do GoogleCalendarPort.",
  "telegram/telegram-http.adapter.ts":
    "Avisos para o canal da equipe: só envia (sendMessage) depois de o desenvolvedor conectar o bot no cofre, e cada aviso respeita o liga/desliga próprio no TelegramNotificadorService. O modo mock/leitura/escrita é de integração de dados e não se aplica a notificação (ADR-0014).",
  "autentique/autentique-http.adapter.ts":
    "Assinatura eletrônica: só fala com a Autentique depois de o desenvolvedor conectar o token da empresa no cofre, e cada chamada usa a conta da empresa do documento. O modo mock/leitura/escrita é de integração de dados e não se aplica a assinatura (ADR-0014).",
  "omie/omie-http.adapter.ts":
    "Financeiro e nota fiscal: só fala com o OMIE depois de o desenvolvedor conectar a chave e o segredo do app no cofre. O modo mock/leitura/escrita do ADR-0005 é de integração de dados e não se aplica à conta única do OMIE da plataforma (ADR-0014).",
  "ia-assinatura/cliproxy-http.adapter.ts":
    "Fala só com o proxy de CLI configurado em CLIPROXY_URL (por padrão local), que guarda os logins da assinatura. Não chama provedor de IA, só login, lista de contas e de modelos; o aceite do risco é exigido antes do login e o uso é restrito a tarefa interna (ADR-0014).",
  "integrations/bitrix/http-bitrix-read.client.ts":
    "Cliente cru do Bitrix; o gate (read_only + flag) é aplicado por BitrixImportService antes de qualquer leitura (ADR-0009).",
};

function arquivosTs(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = path.join(dir, nome);
    if (statSync(caminho).isDirectory()) return nome === "node_modules" ? [] : arquivosTs(caminho);
    return caminho.endsWith(".ts") && !caminho.endsWith(".spec.ts") ? [caminho] : [];
  });
}

/** Devolve as violações: arquivos com acesso à rede, sem gate e sem exceção registrada. */
export function verificar(srcDir, excecoes = EXCECOES) {
  const violacoes = [];
  for (const arquivo of arquivosTs(srcDir)) {
    const relativo = path.relative(srcDir, arquivo).split(path.sep).join("/");
    const texto = readFileSync(arquivo, "utf8");
    if (!PADROES_DE_REDE.some((padrao) => padrao.test(texto))) continue;
    if (/\bIntegrationGate\b/.test(texto) || relativo in excecoes) continue;
    violacoes.push(
      `${relativo}: acesso à rede sem IntegrationGate. Use o gate ou registre a exceção no ADR-0014 e em scripts/verifica-rede-externa.mjs.`,
    );
  }
  return violacoes;
}

function principal() {
  const violacoes = verificar(path.join(RAIZ, "apps/api/src"));
  if (violacoes.length > 0) {
    console.error("verifica-rede-externa: adaptador chama a rede fora do modelo de modo:");
    for (const v of violacoes) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log("verifica-rede-externa: ok");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
