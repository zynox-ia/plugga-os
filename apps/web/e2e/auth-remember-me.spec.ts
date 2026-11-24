import { expect, test } from "@playwright/test";

import { GOOGLE_SIGN_IN_STUB } from "./support/google-sign-in";
import { bloquearTerceiros } from "./support/sem-terceiros";

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  await bloquearTerceiros(page);
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ contentType: "text/css", body: "" }),
  );
  await page.route("https://accounts.google.com/gsi/client*", (route) =>
    route.fulfill({ contentType: "text/javascript", body: GOOGLE_SIGN_IN_STUB }),
  );
});

for (const rememberMe of [false, true]) {
  test(`o login por senha envia a preferência ${rememberMe}`, async ({ page }) => {
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
    );
    await page.goto("/login");
    const checkbox = page.getByRole("checkbox", { name: "Mantenha-me conectado" });
    await expect(checkbox).not.toBeChecked();
    if (rememberMe) {
      await checkbox.focus();
      await page.keyboard.press("Space");
      await expect(checkbox).toBeChecked();
    }
    await page.getByLabel("E-mail", { exact: true }).fill("admin@plugga.local");
    await page.getByLabel("Senha", { exact: true }).fill("synthetic-only-password");
    const request = page.waitForRequest("**/api/auth/login");
    await page.getByRole("button", { name: "Fazer login", exact: true }).click();
    expect((await request).postDataJSON().rememberMe).toBe(rememberMe);
  });
}

test("o botão Google acompanha marcar e desmarcar, inclusive após voltar ao login", async ({ page }) => {
  await page.goto("/login");
  const google = page.getByRole("button", { name: "Fazer login com o Google" });
  await expect(google).toHaveAttribute("data-login-state", "session");
  await page.getByText("Mantenha-me conectado", { exact: true }).click();
  await expect(google).toHaveAttribute("data-login-state", "remember");
  await page.getByText("Mantenha-me conectado", { exact: true }).click();
  await expect(google).toHaveAttribute("data-login-state", "session");
  await page.getByRole("link", { name: "Esqueceu a senha?" }).click();
  await page.goBack();
  await expect(google).toHaveAttribute("data-login-state", "session");
  await page.getByText("Mantenha-me conectado", { exact: true }).click();
  await expect(google).toHaveAttribute("data-login-state", "remember");
});

test("marcar enquanto o Google carrega preserva a escolha no botão", async ({ page }) => {
  let liberar!: () => void;
  const aguardar = new Promise<void>((resolve) => { liberar = resolve; });
  await page.route("https://accounts.google.com/gsi/client*", async (route) => {
    await aguardar;
    await route.fulfill({ contentType: "text/javascript", body: GOOGLE_SIGN_IN_STUB });
  });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByText("Mantenha-me conectado", { exact: true }).click();
  liberar();
  await expect(page.getByRole("button", { name: "Fazer login com o Google" }))
    .toHaveAttribute("data-login-state", "remember");
});

test("Google bloqueado continua oculto após voltar à tela de login", async ({ page }) => {
  await page.route("https://accounts.google.com/gsi/client*", (route) => route.abort());
  await page.goto("/login");
  await expect(page.locator(".auth-google-slot")).toHaveCount(0);
  await page.getByRole("link", { name: "Esqueceu a senha?" }).click();
  await page.goBack();
  await expect(page.locator(".auth-google-slot")).toHaveCount(0);
  await expect(page.locator(".auth-pill-divider")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Fazer login", exact: true })).toBeEnabled();
});
