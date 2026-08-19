/**
 * CSRF defense in depth for our own cookie-bearing proxy routes, mirroring the
 * API's OriginCheckGuard (apps/api/src/auth/origin-check.guard.ts) rather than
 * comparing against this request's own URL: Next.js can report a canonicalized
 * host (e.g. "localhost") that differs from the literal host a browser used
 * (e.g. "127.0.0.1"), so a same-origin check against request.url would reject
 * legitimate same-origin requests. Browsers always send Origin on cross-site
 * fetches; same-origin page navigations/form posts and server-to-server calls
 * (curl, tests) omit it, so absence is allowed.
 *
 * 🔒 SEGURANÇA [VULN-6, auditoria zero-trust]: esta mesma função existia
 * copiada em `api-proxy.ts`, `auth-proxy.ts`, `commercial-proxy.ts`,
 * `compras-proxy.ts` e `energy-proxy.ts` — cinco cópias idênticas, cada uma
 * com um comentário explicando por que era "intencional" não compartilhar. O
 * risco real de cinco cópias não é filosófico, é de manutenção: uma correção
 * futura (por exemplo, um novo esquema de origem confiável, ou um bug na
 * comparação) aplicada em 4 dos 5 lugares deixaria uma rota silenciosamente
 * vulnerável a CSRF sem que ninguém percebesse — a suíte de testes de cada
 * proxy testa a própria cópia, nunca a divergência entre elas. Um módulo só,
 * sem dependência de `core/auth` nem de nenhum outro domínio (continua sendo
 * puro `app/lib/`, no mesmo nível de `env.ts`/`forwarded-for.ts`), resolve
 * isso sem violar a separação entre módulos de domínio.
 */
export function isOriginAllowed(request: Request): boolean {
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
