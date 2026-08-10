import { googleLoginErrorCodeSchema, type GoogleLoginErrorCode } from "@plugga/shared";

// Extensão explícita: este módulo é exercitado por `node --test`, que resolve
// como ESM do Node e não aceita import sem extensão (ver tsconfig.json, onde
// `allowImportingTsExtensions` existe exatamente por isso). O bundler do Next
// resolve o caminho literal sem reclamar.
import { apiBaseUrl } from "./env.ts";
import { clientForwardedFor } from "./forwarded-for.ts";

/**
 * Recepção do POST que o Google faz no modo redirect do GIS.
 *
 * Fica separado do route handler para poder ser exercitado com `node --test`
 * sem subir o Next: o que precisa de teste aqui é a travessia (corpo, cookies,
 * `Set-Cookie` de volta, tradução de erro em redirect), não o roteamento.
 *
 * Por que este handler não reaproveita `auth-proxy.ts`: aquele proxy exige JSON
 * e recusa `Origin` de fora, e as duas coisas estão erradas para este caminho.
 * Quem posta aqui é o Google — `application/x-www-form-urlencoded`, com
 * `Origin: https://accounts.google.com`. Bloquear por origem mataria o fluxo; o
 * que protege esta rota é o double-submit `g_csrf_token`, conferido pela API.
 */

/**
 * Teto do corpo aplicado ANTES de qualquer parse. Um ID token do Google fica
 * bem abaixo de 2 KB; 16 KB dá folga para os campos extras que o provedor
 * acrescenta sem deixar um POST inflado custar processamento.
 */
const MAX_BODY_BYTES = 16 * 1024;

const FETCH_TIMEOUT_MS = 15_000;

/** Destino de sucesso: página que só recompõe o deep link e sai de cena. */
export const GOOGLE_COMPLETE_PATH = "/auth/google/complete";

interface GoogleCallbackOptions {
  /** Injetável para teste; em produção é o `fetch` global. */
  fetchImpl?: typeof fetch;
}

function redirect(location: string, setCookies: string[] = []): Response {
  // `Location` relativa é válida (RFC 7231) e evita reconstruir a origem a
  // partir de Host/X-Forwarded-Host, que são controlados por quem chama e
  // transformariam este redirect em open redirect / cache poisoning.
  const headers = new Headers({
    location,
    "cache-control": "no-store",
  });
  for (const cookie of setCookies) {
    headers.append("set-cookie", cookie);
  }
  // 303 troca o POST por GET na volta — sem isso o browser repetiria o POST
  // (agora sem credential) contra a página de destino.
  return new Response(null, { status: 303, headers });
}

function failure(code: GoogleLoginErrorCode): Response {
  return redirect(`/login?googleError=${code}`);
}

/** Código público que a API anexou ao corpo; o status é só o plano B. */
async function upstreamErrorCode(upstream: Response): Promise<GoogleLoginErrorCode> {
  try {
    const body: unknown = await upstream.json();
    if (body && typeof body === "object" && "code" in body) {
      const parsed = googleLoginErrorCodeSchema.safeParse((body as { code: unknown }).code);
      if (parsed.success) {
        return parsed.data;
      }
    }
  } catch {
    // Corpo não-JSON (proxy no meio, 502 de gateway): cai no mapa por status.
  }

  if (upstream.status === 429) return "rate_limited";
  if (upstream.status === 503 || upstream.status >= 500) return "unavailable";
  if (upstream.status === 403) return "disabled";
  return "unauthorized";
}

export async function handleGoogleCallback(
  request: Request,
  options: GoogleCallbackOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return failure("unauthorized");
  }

  const rawBody = await request.text();
  // O tamanho declarado pode mentir; o real é que decide.
  if (rawBody.length === 0 || rawBody.length > MAX_BODY_BYTES) {
    return failure("unauthorized");
  }

  const form = new URLSearchParams(rawBody);
  // Recusa barata antes de atravessar para a API: sem os dois campos não há
  // nem credencial para verificar nem token para comparar.
  if (!form.get("credential") || !form.get("g_csrf_token")) {
    return failure("unauthorized");
  }

  const cookie = request.headers.get("cookie");
  const forwardedFor = clientForwardedFor(request);

  let upstream: Response;
  try {
    upstream = await fetchImpl(`${apiBaseUrl()}/auth/google`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        // O cookie carrega o `g_csrf_token` que a API compara com o corpo.
        ...(cookie ? { cookie } : {}),
        ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      },
      // Encaminhado como veio: reencodar arriscaria perder um campo que o
      // Google acrescente e que só ele saiba interpretar.
      body: rawBody,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return failure("unavailable");
  }

  if (!upstream.ok) {
    return failure(await upstreamErrorCode(upstream));
  }

  // A sessão é a MESMA do login por senha; aqui ela só muda de origem para o
  // domínio do app, sem que o browser precise falar com a API diretamente.
  return redirect(GOOGLE_COMPLETE_PATH, upstream.headers.getSetCookie());
}
