import { NextResponse } from "next/server";

import { apiBaseUrl } from "./env";
import { clientForwardedFor } from "./forwarded-for";
import { isOriginAllowed } from "./origin-check";

/**
 * Folga para a travessia até a API.
 *
 * Cinco segundos bastavam quando o banco era local. Hoje toda consulta atravessa
 * o túnel SSH até a VPS, e listar a equipe com acesso por empresa e departamento
 * custa ~2,8 s de linha de base — margem estreita demais: qualquer lentidão
 * passageira derruba a tela com "serviço indisponível", que manda procurar
 * defeito onde não há.
 */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Forwards a request to the real POST /auth/* endpoint on apps/api, carrying the
 * browser's session cookie to the API and relaying any Set-Cookie back to the
 * browser under this app's own origin. This keeps the session cookie same-origin
 * from the browser's point of view (no CORS/credentialed-fetch setup needed on
 * the API) while the API remains the sole source of truth for the session.
 */
export function proxyAuthPost(request: Request, apiPath: string): Promise<NextResponse> {
  return proxyAuthMutation(request, "POST", apiPath);
}

/** Mesma travessia do POST, para as rotas de equipe que substituem acesso. */
export function proxyAuthPut(request: Request, apiPath: string): Promise<NextResponse> {
  return proxyAuthMutation(request, "PUT", apiPath);
}

async function proxyAuthMutation(
  request: Request,
  method: "POST" | "PUT",
  apiPath: string,
): Promise<NextResponse> {
  if (!isOriginAllowed(request)) {
    return NextResponse.json({ message: "origin not allowed" }, { status: 403 });
  }

  // Some routes (logout) have no body; others require a JSON object.
  const rawBody = await request.text();
  if (rawBody.length > 0) {
    try {
      JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ message: "request body must be valid JSON" }, { status: 400 });
    }
  }

  const cookie = request.headers.get("cookie");
  const forwardedFor = clientForwardedFor(request);

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/auth/${apiPath}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      },
      body: rawBody.length > 0 ? rawBody : "{}",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "auth service unavailable" }, { status: 503 });
  }

  return relayUpstream(upstream);
}

/** Forwards a request to a GET /auth/* endpoint, carrying the session cookie only. */
export async function proxyAuthGet(request: Request, apiPath: string): Promise<NextResponse> {
  const cookie = request.headers.get("cookie");

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/auth/${apiPath}`, {
      method: "GET",
      headers: cookie ? { cookie } : {},
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "auth service unavailable" }, { status: 503 });
  }

  return relayUpstream(upstream);
}

async function relayUpstream(upstream: Response): Promise<NextResponse> {
  const text = await upstream.text();
  const response = new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });

  for (const setCookie of upstream.headers.getSetCookie()) {
    response.headers.append("set-cookie", setCookie);
  }

  return response;
}
