// Os imports relativos levam a extensão `.ts` de propósito: este módulo é
// exercitado por `node --test`, que resolve como ESM do Node.
import { apiBaseUrl } from "./env-runtime.ts";
import { clientForwardedFor } from "./forwarded-for.ts";
import { DESTINO_DAS_INTEGRACOES, type ResultadoDaConexao } from "./google-calendar-resultado.ts";

/**
 * Retorno do consentimento do Google (agenda da pessoa).
 *
 * O Google manda o navegador de volta a `/api/google/calendar/callback` com
 * `code` e `state` (ou `error`). Este módulo repassa os dois à API, com a sessão
 * da pessoa, e devolve a pessoa à aba de integrações com um resultado de uma
 * lista fechada. Nenhuma mensagem de erro do Google ou da API vai para a URL:
 * só um código, que a tela traduz (`MENSAGEM_DO_RESULTADO`), para o endereço não
 * servir de canal de texto forjado.
 *
 * A proteção contra CSRF deste retorno é o `state` selado, que a API amarra à
 * pessoa e à sessão que iniciaram o pedido. O `Origin` que segue para a API é o
 * do próprio app: o retorno é uma navegação (o navegador não manda `Origin` em
 * GET), então o web, que é a origem confiável, o informa na chamada servidor a
 * servidor.
 */

/** Tempo para a API trocar o código com o Google e guardar o token. */
const TEMPO_MAXIMO_MS = 20_000;

interface OpcoesDoCallback {
  /** Injetável para teste; em produção é o `fetch` global. */
  fetchImpl?: typeof fetch;
}

function redirecionar(location: string): Response {
  // `Location` relativa evita reconstruir a origem a partir de Host/X-Forwarded-Host,
  // que quem chama controla. 303: a volta é sempre um GET.
  return new Response(null, { status: 303, headers: { location, "cache-control": "no-store" } });
}

function voltar(resultado: ResultadoDaConexao): Response {
  return redirecionar(`${DESTINO_DAS_INTEGRACOES}&google=${resultado}`);
}

/** O `Origin` do próprio app: o configurado para a API ou, sem configuração, o local. */
export function origemDoApp(request: Request): string | null {
  const configuradas = (process.env.AUTH_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((valor) => valor.trim())
    .filter((valor) => valor.length > 0);
  if (configuradas[0]) return configuradas[0];

  try {
    const origem = new URL(request.url);
    return origem.hostname === "localhost" || origem.hostname === "127.0.0.1" ? origem.origin : null;
  } catch {
    return null;
  }
}

export async function handleGoogleCalendarCallback(request: Request, opcoes: OpcoesDoCallback = {}): Promise<Response> {
  const fetchImpl = opcoes.fetchImpl ?? fetch;
  const consulta = new URL(request.url).searchParams;

  const erroDoGoogle = consulta.get("error");
  if (erroDoGoogle) return voltar(erroDoGoogle === "access_denied" ? "negado" : "erro");

  const code = consulta.get("code");
  const state = consulta.get("state");
  // Teto antes de atravessar para a API: o Google não manda nada deste tamanho.
  if (!code || !state || code.length > 2048 || state.length > 4096) return voltar("invalido");

  const cookie = request.headers.get("cookie");
  const encaminhado = clientForwardedFor(request);
  const origem = origemDoApp(request);

  let resposta: Response;
  try {
    resposta = await fetchImpl(`${apiBaseUrl()}/google/calendar/conexao/retorno`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(encaminhado ? { "x-forwarded-for": encaminhado } : {}),
        ...(origem ? { origin: origem } : {}),
      },
      body: JSON.stringify({ code, state }),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
      cache: "no-store",
    });
  } catch {
    return voltar("indisponivel");
  }

  if (resposta.ok) return voltar("conectado");
  // Sem sessão: o código se perde, e a pessoa entra e conecta de novo.
  if (resposta.status === 401) return redirecionar("/login");
  if (resposta.status === 400) return voltar("invalido");
  if ([409, 429, 502, 503, 504].includes(resposta.status)) return voltar("indisponivel");
  return voltar("erro");
}
