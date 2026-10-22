import { defineConfig, devices } from "@playwright/test";

// API sintética e saída própria: os testes não usam banco nem o servidor do André.
export default defineConfig({
  testDir: "./design-system-tests",
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3118",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node e2e/support/api-simulada.mjs",
      url: "http://127.0.0.1:3198/auth/me",
      env: { API_SIMULADA_PORT: "3198" },
    },
    {
      command: "pnpm exec next dev --port 3118",
      url: "http://127.0.0.1:3118/login",
      timeout: 120_000,
      env: { DESIGN_SYSTEM_E2E: "true", API_INTERNAL_URL: "http://127.0.0.1:3198" },
    },
  ],
});
