import { defineConfig, devices } from "@playwright/test";

/**
 * Shared session for tests that exercise post-login screens. Every route now
 * sits behind real auth (ADR-0008), so the default project reuses one login
 * from the "setup" project instead of each spec re-authenticating. Specs that
 * need to start signed out (apps/web/e2e/auth.spec.ts) opt out per-file via
 * `test.use({ storageState: { cookies: [], origins: [] } })`.
 *
 * `PLAYWRIGHT_AUTH_FILE` troca o arquivo do login salvo, para dois agentes
 * rodarem a suíte ao mesmo tempo sem um sobrescrever a sessão do outro. Sem
 * ela, vale o caminho de sempre (a CI não define a variável).
 */
const AUTH_STORAGE_STATE = process.env.PLAYWRIGHT_AUTH_FILE || "e2e/.auth/admin.json";

export default defineConfig({
  testDir: "./e2e",
  // Cada execução tem um runId (E2E_RUN_ID); o que os specs criam leva a marca
  // dele no nome e sai no fim, se houver E2E_CLEANUP_DATABASE_URL (banco local).
  globalSetup: "./e2e/support/execucao-setup.ts",
  globalTeardown: "./e2e/support/execucao-teardown.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      // Movimento reduzido: o lib/movimento.ts deixa tudo no estado final, e
      // medidas e foco não são lidos no meio de uma entrada ou saída animada.
      // A animação em si é testada no movimento.spec, que volta o movimento.
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STORAGE_STATE, contextOptions: { reducedMotion: "reduce" } },
      dependencies: ["setup"],
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // A suíte principal verifica produção e exige `pnpm build` antes.
        // O preview de tarefas temporárias usa test:atividades-dev, com Next DEV.
        // The suite serves the same standalone tree assembled by the Dockerfile. The
        // helper copies static/public before booting; `next start` is unsupported
        // when next.config.ts uses `output: "standalone"`.
        command: "node scripts/start-standalone.mjs",
        url: "http://127.0.0.1:3000",
        // Recusa uma porta ocupada em vez de testar o localhost DEV do André.
        reuseExistingServer: false,
        timeout: 120_000,
        // O login Google fica LIGADO na suíte, com um client id de mentira: o
        // que os testes exercitam é a nossa metade do fluxo (renderização,
        // fallback sem script, erro enumerado, deep link, open redirect), e
        // nada disso chama o Google de verdade. Deixar a flag a cargo do
        // ambiente faria a suíte passar ou falhar conforme a máquina.
        env: {
          GOOGLE_AUTH_ENABLED: "true",
          GOOGLE_OIDC_CLIENT_ID: "e2e-only.apps.googleusercontent.com",
          GOOGLE_LOGIN_URI: "http://127.0.0.1:3000/api/auth/google/callback",
        },
      },
});
