import { NextResponse, type NextRequest } from "next/server";

import { buildContentSecurityPolicy } from "./app/lib/content-security-policy";
import { apiBaseUrl } from "./app/lib/env";
import { shouldBypassSessionCheck } from "./app/lib/public-paths";

// Mesma folga de auth-proxy.ts e do FETCH_TIMEOUT_TUNEL_MS de app/lib/api.ts:
// validar a sessão atravessa o túnel SSH (~2 s de base), e 5 s expulsava
// usuário logado para /login em qualquer pico de latência.
const FETCH_TIMEOUT_MS = 15_000;

/**
 * 🔒 SEGURANÇA [VULN-4]: nonce de 16 bytes aleatórios por requisição, único a
 * cada carregamento de página — reusar um nonce entre requisições anularia a
 * proteção (um atacante que conseguisse ver um nonce antigo o reaproveitaria).
 * `crypto.getRandomValues` porque o middleware roda no Edge Runtime, onde
 * `node:crypto` não está disponível.
 */
function gerarNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario);
}

/**
 * Constrói a resposta com o CSP com nonce aplicado — tanto no header devolvido
 * ao navegador quanto no header repassado ao Next.js internamente (via
 * `request.headers`), que é como o próprio framework sabe qual nonce usar nos
 * `<script>` que ele emite para hidratação (confirmado lendo
 * `getScriptNonceFromHeader` em `next/dist/server/app-render`). Sem essa
 * segunda cópia, o servidor não veria o nonce e os scripts do próprio Next.js
 * quebrariam sob o CSP que acabamos de mandar ao navegador.
 */
function proximaComCsp(request: NextRequest): NextResponse {
  const nonce = gerarNonce();
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "production");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

/**
 * Mesma ideia, para um redirect: o destino também precisa do header — é a
 * PRÓXIMA resposta que o navegador vai renderizar.
 */
function redirectComCsp(request: NextRequest, url: URL): NextResponse {
  const nonce = gerarNonce();
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "production");
  const response = NextResponse.redirect(url);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

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
 *
 * 🔒 SEGURANÇA [VULN-4]: também roda sob `/api/*` (matcher ampliado abaixo)
 * para que o CSP com nonce cubra as rotas HTML servidas por proxy, como o
 * relatório de eficiência energética (`/api/energia/estudos/[id]/documento`,
 * vetor do VULN-1) — sem isso, o endpoint que mais precisava da segunda
 * camada de defesa contra XSS ficava fora dela. O auth-gate abaixo continua
 * restrito a navegação de página: rotas `/api/*` fazem sua própria checagem
 * de sessão (repassando o cookie para a API) e não devem ser redirecionadas.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    return proximaComCsp(request);
  }

  // A página de login é a única pública que depende da sessão, para evitar
  // mostrar o formulário a quem já está autenticado. As demais não devem
  // atravessar a API só para abrir um link, convite, reset ou documento legal.
  if (shouldBypassSessionCheck(pathname)) {
    return proximaComCsp(request);
  }

  const authenticated = await hasValidSession(request);

  if (pathname === "/login") {
    return authenticated ? redirectComCsp(request, redirectTo(request, "/")) : proximaComCsp(request);
  }

  if (!authenticated) {
    const loginUrl = redirectTo(request, "/login");
    if (pathname !== "/") loginUrl.searchParams.set("redirectTo", pathname);
    return redirectComCsp(request, loginUrl);
  }

  return proximaComCsp(request);
}

export const config = {
  matcher: ["/((?!_next|brand|fonts|favicon.ico).*)"],
};
