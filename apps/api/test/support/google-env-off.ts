/**
 * Garante o login Google DESLIGADO antes de `app.module` ser importado.
 *
 * Não basta "não ligar": o vitest reaproveita processos entre arquivos de
 * teste, então o `process.env` que outro spec escreveu sobrevive. Se este
 * arquivo rodasse no mesmo worker depois de `support/google-env.ts`, herdaria a
 * flag ligada e o cenário de rollback passaria a testar o oposto do que diz —
 * às vezes, dependendo da ordem. Apagar explicitamente é o que torna o
 * resultado independente de quem rodou antes.
 */
delete process.env.GOOGLE_AUTH_ENABLED;
delete process.env.GOOGLE_OIDC_CLIENT_ID;
delete process.env.GOOGLE_LOGIN_URI;
