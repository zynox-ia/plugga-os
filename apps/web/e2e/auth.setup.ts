import { expect, test as setup } from "@playwright/test";

const STORAGE_STATE = "e2e/.auth/admin.json";

/** Matches apps/api/prisma/seed.ts + .env.example / CI job env — local dev only. */
const email = process.env.SEED_ADMIN_EMAIL ?? "admin@plugga.local";
const password = process.env.SEED_ADMIN_PASSWORD ?? "local_only_change_me";

setup("authenticate as the seeded local admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.locator(".app-shell")).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
