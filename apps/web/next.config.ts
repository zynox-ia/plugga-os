import path from "node:path";

import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * 🔒 SEGURANÇA [VULN-4, auditoria zero-trust]: o Content-Security-Policy NÃO
 * é declarado aqui — `headers()` roda uma vez por build/deploy, sem acesso à
 * requisição, então nunca poderia carregar um nonce por requisição. Ele agora
 * vive em `middleware.ts` + `app/lib/content-security-policy.ts`, que rodam a
 * cada requisição e removem `'unsafe-inline'` de `script-src` em favor de
 * `'nonce-<valor único>' 'strict-dynamic'`. Antes, `'unsafe-inline'` permitia
 * QUALQUER `<script>` inline executar — inclusive um injetado por um XSS
 * armazenado (o VULN-1 desta auditoria), o que fazia do CSP uma defesa
 * decorativa contra exatamente o ataque para o qual ele existe.
 */
const securityHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // 🔒 SEGURANÇA [VULN-5]: Cross-Origin-Opener-Policy isola esta aba do
  // `window.opener` de qualquer página que a tenha aberto — inclusive
  // relevante no fluxo de login Google (GIS abre em popup/redirect). Sem
  // isso, uma aba de outra origem que nos abriu manteria uma referência
  // `window.opener` capaz de navegar esta janela. Cross-Origin-Resource-Policy
  // impede que OUTRA origem carregue recursos daqui (imagens, fontes) via
  // `<img>`/`<script>` cross-site — reduz superfície de ataques
  // Spectre-like e de vazamento por timing entre origens.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  // Keep development artifacts separate from production builds. Running `next
  // build` while the local server is open must never remove its route manifests.
  distDir: isProduction ? ".next" : ".next-dev",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@plugga/shared"],
  // Produces .next/standalone with only the traced runtime dependencies, so the
  // container does not carry the whole workspace. Tracing must start at the
  // monorepo root or the @plugga/shared link is missed.
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
