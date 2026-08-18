import { NextResponse, type NextRequest } from "next/server";

import { apiBaseUrl } from "./app/lib/env";
import { shouldBypassSessionCheck } from "./app/lib/public-paths";

// Mesma folga de auth-proxy.ts e do FETCH_TIMEOUT_TUNEL_MS de app/lib/api.ts:
// validar a sessão atravessa o túnel SSH (~2 s de base), e 5 s expulsava
// usuário logado para /login em qualquer pico de latência.
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Builds a same-origin redirect target from request.nextUrl. Do not fall back
 * to the Host/X-Forwarded-Host headers here: they're attacker-controlled and
 * unvalidated, which turns a same-origin redirect into an open redirect (and,
 * without a Vary on those headers, a cache-poisoning vector behind a CDN). The
 * previous loopback-canonicalization issue (127.0.0.1 -> localhost dropping
 * the session cookie) was a Playwright webServer artifact, fixed by dropping
 * --hostname from playwright.config.ts, not something this redirect needs to
 * work around.
 */
function redirectTo(request: NextRequest, pathname: string): URL {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return url;
}

/** True when apps/api's session cookie is accepted by GET /auth/me. */
async function hasValidSession(request: NextRequest): Promise<boolean> {
  const cookie = request.headers.get("cookie");
  if (!cookie) return false;

  try {
    const response = await fetch(`${apiBaseUrl()}/auth/me`, {
      headers: { cookie },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Gates every app route behind a real session (ADR-0008), replacing the former
 * dev-header stub as the default path. /login and the token-based invite/reset
 * pages stay public so a signed-out visitor can always reach them.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // A página de login é a única pública que depende da sessão, para evitar
  // mostrar o formulário a quem já está autenticado. As demais não devem
  // atravessar a API só para abrir um link, convite, reset ou documento legal.
  if (shouldBypassSessionCheck(pathname)) {
    return NextResponse.next();
  }

  const authenticated = await hasValidSession(request);

  if (pathname === "/login") {
    return authenticated ? NextResponse.redirect(redirectTo(request, "/")) : NextResponse.next();
  }

  if (!authenticated) {
    const loginUrl = redirectTo(request, "/login");
    if (pathname !== "/") loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|brand|fonts|favicon.ico).*)"],
};
