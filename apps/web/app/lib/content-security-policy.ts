/**
 * Content-Security-Policy compartilhada entre middleware (por requisição, com
 * nonce) e qualquer teste que precise da mesma política.
 *
 * 🔒 SEGURANÇA [VULN-4, auditoria zero-trust]: antes, `script-src` incluía
 * `'unsafe-inline'`, o que permite QUALQUER `<script>` inline executar —
 * inclusive um injetado por um XSS armazenado (o próprio VULN-1 desta
 * auditoria, já corrigido na origem, mas o CSP era a segunda camada de defesa
 * que faltava). Com nonce por requisição + `strict-dynamic`, só o script que o
 * servidor emitiu com o nonce correto roda; um payload injetado não conhece o
 * nonce e o navegador recusa executá-lo, mesmo que a sanitização de output
 * falhe em algum ponto futuro que esta auditoria não viu.
 *
 * `strict-dynamic` é o que permite os scripts carregados dinamicamente do
 * UnicornStudio (`unicorn-background.tsx`) e do Google Identity Services
 * (`google-sign-in-button.tsx`) continuarem funcionando: um script já
 * autorizado pelo nonce pode criar e injetar outros `<script src="...">` sem
 * que cada host precise entrar manualmente na allowlist — mas só JavaScript,
 * nunca HTML injetado por dado de usuário, que é o vetor do VULN-1.
 */
export function buildContentSecurityPolicy(nonce: string, isProduction: boolean): string {
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // Fallback para navegadores que não suportam strict-dynamic (ignorado
    // pelos que suportam, por especificação do CSP nível 3).
    "https://accounts.google.com",
    "https://cdn.jsdelivr.net",
  ];
  if (!isProduction) scriptSources.push("'unsafe-eval'");

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https://assets.unicorn.studio",
    "font-src 'self' https://fonts.gstatic.com",
    // style-src continua com 'unsafe-inline': o app usa `style={{ ... }}` do
    // React em vários pontos (ex.: dashboard-view.tsx), que o React emite como
    // atributo `style="..."` inline. Não há XSS conhecido por essa via — CSS
    // não executa JavaScript — e nonce por atributo `style` exigiria tocar
    // todo componente que usa style inline; fora do escopo desta correção.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `script-src ${scriptSources.join(" ")}`,
    "connect-src 'self' https://storage.googleapis.com",
    "frame-src https://accounts.google.com https://my.spline.design",
  ].join("; ");
}
