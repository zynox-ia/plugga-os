import { defineConfig, devices } from "@playwright/test";

/**
 * Shared session for tests that exercise post-login screens. Every route now
 * sits behind real auth (ADR-0008), so the default project reuses one login
 * from the "setup" project instead of each spec re-authenticating. Specs that
 * need to start signed out (apps/web/e2e/auth.spec.ts) opt out per-file via
 * `test.use({ storageState: { cookies: [], origins: [] } })`.
 */
const AUTH_STORAGE_STATE = "e2e/.auth/admin.json";

export default defineConfig({
  testDir: "./e2e",
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
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STORAGE_STATE },
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
