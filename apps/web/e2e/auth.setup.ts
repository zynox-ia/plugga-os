import { expect, test as setup } from "@playwright/test";

const STORAGE_STATE = "e2e/.auth/admin.json";

/** Matches apps/api/prisma/seed.ts + .env.example / CI job env — local dev only. */
const email = process.env.SEED_ADMIN_EMAIL ?? "admin@plugga.local";
const password = process.env.SEED_ADMIN_PASSWORD ?? "local_only_change_me";

// All of the suite's real login requests originate from this one machine, so
// without a distinguishing X-Forwarded-For they'd collapse into one throttle
// bucket (10 req/60s on /auth/login) and start 429ing each other. Each spec
// file gets its own synthetic client IP.
setup.use({ extraHTTPHeaders: { "x-forwarded-for": "203.0.113.201" } });

setup("authenticate as the seeded local admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Fazer login" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.locator(".app-shell")).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
