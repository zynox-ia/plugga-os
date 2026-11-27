import type { SessionUser } from "@plugga/shared";
import { NextResponse, type NextRequest } from "next/server";
import { CORPO_DO_NAO_ENCONTRADO, fechadaPeloPortaoDoFinanceiro, podeAbrirPagina, proxyFechadoPeloPortaoDoFinanceiro } from "./app/lib/acesso-paginas";

import { buildContentSecurityPolicy } from "./app/lib/content-security-policy";
import { apiBaseUrl } from "./app/lib/env-runtime";
import { shouldBypassSessionCheck } from "./app/lib/public-paths";
import { CABECALHO_DO_CAMINHO, decidirPagina, lerSessaoDaApi, ROTA_DE_API_INDISPONIVEL } from "./app/lib/sessao-do-middleware";

// Mesma folga de proxy.ts e do FETCH_TIMEOUT_TUNEL_MS de app/lib/api.ts:
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
  // O endereço completo (com a query) para o exigirPagina guardar o destino inteiro (PLU-343).
  requestHeaders.set(CABECALHO_DO_CAMINHO, `${request.nextUrl.pathname}${request.nextUrl.search}`);

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

/**
 * API indisponível (PLU-343): a página pedida mostra o aviso padrão no MESMO
 * endereço (rewrite, não redirect), então nada se perde — nem o destino — e a
 * própria página tenta de novo até a API voltar. Sem cache: a próxima
 * requisição já deve ver a página real.
 */
function avisoDeIndisponivelComCsp(request: NextRequest): NextResponse {
  const nonce = gerarNonce();
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "production");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  // O aviso volta à página pedida por aqui, não por um `de` da query dela (PLU-357).
  requestHeaders.set(CABECALHO_DO_CAMINHO, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const destino = request.nextUrl.clone();
  destino.pathname = ROTA_DE_API_INDISPONIVEL;
  const response = NextResponse.rewrite(destino, { request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * Página do Financeiro com o portão fechado (PLU-336): 404 do próprio
 * middleware, como resposta direta. O Next devolve o status de uma resposta
 * dessas como está; num rewrite ou na continuação, o status sairia do render,
 * e uma resposta já em streaming iria com 200. Sem script, então a CSP fecha
 * tudo menos o estilo inline. Vale para navegação direta, RSC e prefetch (o
 * App Router, sem payload RSC, recarrega o endereço e mostra esta página).
 */
function naoEncontrado(): NextResponse {
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Página não encontrada · Plugga OS</title>
<style>
:root{color-scheme:light dark;--fundo:#f6f6f4;--texto:#1d1d1b;--suave:#6b6b66;--borda:#d9d9d4}
@media (prefers-color-scheme:dark){:root{--fundo:#161615;--texto:#ececea;--suave:#a3a39e;--borda:#3a3a37}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--fundo);color:var(--texto);font:400 16px/1.5 system-ui,sans-serif;padding:0 16px}
main{max-width:28rem;text-align:center}h1{font-size:1.5rem;font-weight:500;margin:0 0 .5rem}p{color:var(--suave);margin:0 0 1.5rem}
a{display:inline-block;color:inherit;border:1px solid var(--borda);border-radius:8px;padding:.5rem 1rem;text-decoration:none;font-weight:500}a:focus-visible{outline:2px solid currentColor;outline-offset:2px}
</style></head>
<body><main><p>Erro 404</p><h1>Página não encontrada</h1><p>O endereço não existe ou não está disponível.</p><a href="/">Voltar ao início</a></main></body></html>`;
  return new NextResponse(html, {
    status: 404,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}

/**
 * Gates every app route behind a real session (ADR-0008), replacing the former
 * dev-header stub as the default path. /login and the token-based invite/reset
 * pages stay public so a signed-out visitor can always reach them.
 *
 * 🔒 SEGURANÇA [VULN-4]: também roda sob `/api/*` (matcher ampliado abaixo)
 * para que o CSP com nonce cubra rotas HTML servidas por proxy (o vetor do
 * VULN-1 era um relatório HTML assim) — sem isso, esse tipo de endpoint
 * ficaria fora da segunda camada de defesa contra XSS. O auth-gate abaixo continua
 * restrito a navegação de página: rotas `/api/*` fazem sua própria checagem
 * de sessão (repassando o cookie para a API) e não devem ser redirecionadas.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Financeiro fechado: os proxies dele não existem, antes de qualquer validação local ou da API,
  // comparando o caminho decodificado (o proxy confere de novo o destino resolvido) (PLU-336).
  if (proxyFechadoPeloPortaoDoFinanceiro(pathname)) {
    return NextResponse.json(CORPO_DO_NAO_ENCONTRADO, { status: 404 });
  }

  if (pathname.startsWith("/api/")) {
    return proximaComCsp(request);
  }

  // A página de login é a única pública que depende da sessão, para evitar
  // mostrar o formulário a quem já está autenticado. As demais não devem
  // atravessar a API só para abrir um link, convite, reset ou documento legal.
  if (shouldBypassSessionCheck(pathname)) {
    return proximaComCsp(request);
  }

  // Só 401/403 são "sem sessão"; rede, tempo e 5xx são "API indisponível" (PLU-343).
  const leitura = await lerSessaoDaApi({ cookie: request.headers.get("cookie"), base: apiBaseUrl(), tempoMs: FETCH_TIMEOUT_MS });
  if (leitura.tipo === "indisponivel" && leitura.motivo === "contrato") {
    // /auth/me respondeu 200 fora do contrato (web e API em versões diferentes?): não desloga, mas avisa no log.
    console.warn("middleware: /auth/me respondeu fora do contrato; mostrando API indisponível");
  }
  // Com o Financeiro fechado, a página não existe: logado, 404 aqui mesmo, sem ir ao início (PLU-336).
  // Sem sessão continua indo ao login, e com a API fora, ao aviso.
  const fechada = fechadaPeloPortaoDoFinanceiro(pathname);
  const podeAbrir = (usuario: SessionUser) => fechada || podeAbrirPagina(usuario.acesso, pathname);
  const decisao = decidirPagina(pathname, leitura, podeAbrir, request.nextUrl.search);
  if (decisao.acao === "seguir" && fechada) return naoEncontrado();

  switch (decisao.acao) {
    case "inicio":
      return redirectComCsp(request, redirectTo(request, "/"));
    case "login": {
      const loginUrl = redirectTo(request, "/login");
      if (decisao.redirectTo) loginUrl.searchParams.set("redirectTo", decisao.redirectTo);
      return redirectComCsp(request, loginUrl);
    }
    case "indisponivel":
      return avisoDeIndisponivelComCsp(request);
    default:
      return proximaComCsp(request);
  }
}

export const config = {
  matcher: ["/((?!_next|brand|fonts|favicon.ico).*)"],
};
