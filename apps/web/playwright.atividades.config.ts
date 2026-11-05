import { defineConfig, devices } from "@playwright/test";

/** Preview em desenvolvimento: API de teste já em execução; nunca sobe banco. */
export default defineConfig({
  testDir: "./e2e-dev",
  outputDir: "./test-results/atividades-dev",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3220",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testDir: "./e2e", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/admin.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm exec next dev --port 3220",
    url: "http://localhost:3220/login",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NODE_ENV: "development",
      API_INTERNAL_URL: process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3221",
      PLUGGA_DEV_DIST_DIR: "dist/atividades-e2e",
    },
  },
});
