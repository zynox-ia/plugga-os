import { apiBaseUrl } from "../../../lib/env";
import { clientForwardedFor } from "../../../lib/forwarded-for";

/**
 * A chave da OpenRouter sob a origem do web.
 *
 * Repassa o cookie de sessão e deixa a API decidir o acesso — o web não julga
 * permissão por conta própria. Nenhum `origin` vai junto: o OriginCheckGuard da
 * API aceita a ausência (é o que os proxies irmãos enviam), e um origin
 * sintético sempre-permitido anularia o guard.
 *
 * O corpo do PUT carrega a chave em claro. Isso é aceitável porque a ligação é
 * TLS até o Caddy e loopback dali para dentro — mas é o motivo de esta rota
 * nunca registrar o corpo em log, nem em erro.
 */

/** Mesma folga de auth-proxy.ts: a travessia até a API passa pelo túnel SSH. */
const TEMPO_LIMITE_MS = 15_000;

/**
 * Cópia deliberada de api-proxy.ts/auth-proxy.ts — cada proxy carrega a própria
 * defesa de CSRF (veja o comentário em auth-proxy.ts sobre o porquê do desenho).
 */
function isOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const configured = (process.env.AUTH_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (configured.length > 0) return configured.includes(origin);

  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function cabecalhos(request: Request): HeadersInit {
  const cookie = request.headers.get("cookie");
  const encaminhado = clientForwardedFor(request);
  return {
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
    ...(encaminhado ? { "x-forwarded-for": encaminhado } : {}),
  };
}

async function repassar(resposta: Response): Promise<Response> {
  const corpo = await resposta.text();
  return new Response(corpo, {
    status: resposta.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function origemRecusada(): Response {
  return Response.json({ message: "origin not allowed" }, { status: 403 });
}

function apiIndisponivel(): Response {
  return Response.json({ message: "API indisponível" }, { status: 503 });
}

export async function GET(request: Request): Promise<Response> {
  try {
    return await repassar(
      await fetch(`${apiBaseUrl()}/llm/chave`, {
        headers: cabecalhos(request),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        cache: "no-store",
      }),
    );
  } catch {
    return apiIndisponivel();
  }
}

export async function PUT(request: Request): Promise<Response> {
  if (!isOriginAllowed(request)) return origemRecusada();

  const corpo = await request.text();
  try {
    return await repassar(
      await fetch(`${apiBaseUrl()}/llm/chave`, {
        method: "PUT",
        headers: cabecalhos(request),
        body: corpo,
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        cache: "no-store",
      }),
    );
  } catch {
    return apiIndisponivel();
  }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!isOriginAllowed(request)) return origemRecusada();

  try {
    return await repassar(
      await fetch(`${apiBaseUrl()}/llm/chave`, {
        method: "DELETE",
        headers: cabecalhos(request),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        cache: "no-store",
      }),
    );
  } catch {
    return apiIndisponivel();
  }
}
