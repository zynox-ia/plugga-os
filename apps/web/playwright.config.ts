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
        // Deliberately no --hostname: Next.js's dev/start server canonicalizes an
        // explicit loopback hostname (127.0.0.1) to "localhost" when constructing
        // absolute redirect URLs in middleware, which silently drops the session
        // cookie on a cross-host redirect. Binding to the default interface keeps
        // middleware redirects host-relative and cookie-safe.
        command: process.env.CI
          ? "pnpm exec next start --port 3000"
          : "pnpm exec next dev --port 3000",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
