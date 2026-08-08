import { expect, test } from "@playwright/test";

// This file exercises the signed-out flows on purpose, so it opts out of the
// project's default authenticated storage state (see playwright.config.ts).
// It also gets its own synthetic X-Forwarded-For: every real /auth/login call
// in the suite runs from this one machine, and without a distinguishing IP
// they'd all share the 10-req/60s login throttle bucket and 429 each other
// (see apps/api/src/main.ts's loopback trust + apps/web/app/lib/auth-proxy.ts).
test.use({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-forwarded-for": "203.0.113.202" } });

/** Matches apps/api/prisma/seed.ts + .env.example / CI job env — local dev only. */
const email = process.env.SEED_ADMIN_EMAIL ?? "admin@plugga.local";
const password = process.env.SEED_ADMIN_PASSWORD ?? "local_only_change_me";

test.describe("Auth — session gate, login, logout", () => {
  test("an unauthenticated visitor is redirected to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator(".auth-card")).toBeVisible();
  });

  test("a deep link to a protected route redirects back to it after login", async ({ page }) => {
    await page.goto("/pendencias");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fpendencias$/);

    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/pendencias$/);
  });

  test("wrong credentials show one generic message, never leaking account existence", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.locator(".auth-error")).toHaveText("E-mail ou senha inválidos.");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("correct credentials unlock the shell; logout revokes access again", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.locator(".app-shell")).toBeVisible();

    // Sair passou a viver no menu da engrenagem, não solto na barra superior.
    await page.getByRole("button", { name: "Abrir menu da conta" }).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/pendencias");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fpendencias$/);
  });

  test("an already signed-in visitor hitting /login is sent straight to the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL("/");

    await page.goto("/login");
    await expect(page).toHaveURL("/");
  });
});
