import { expect, test } from "@playwright/test";

import { bloquearTerceiros } from "./support/sem-terceiros";

// Opts out of the project's default authenticated storage state, same as
// auth.spec.ts, because these flows start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

// O adaptador de e-mail que entregava localmente (Mailpit) foi removido em
// 2026-08-10 — Brevo é o único provedor desde 2026-08-09, e o EMAIL_PROVIDER
// padrão agora é `noop`. Sem lugar nenhum para ler o token de verdade, os
// testes que exerciam o caminho feliz de convite/reset via UI (que dependiam
// de buscar o token num Mailpit) saíram junto. O que fica são os três
// caminhos de erro, que não precisam de e-mail nenhum.

test.describe("Auth — invite accept and password reset", () => {
  test.beforeEach(async ({ page }) => {
    await bloquearTerceiros(page);
  });

  test("an invalid invite token shows a generic error, not a crash", async ({ page }) => {
    await page.goto("/auth/accept-invite?token=not-a-real-token-at-all-0000000000");
    await page.getByLabel("Nova senha").fill("a-perfectly-fine-password-1");
    await page.getByLabel("Confirmar senha").fill("a-perfectly-fine-password-1");
    await page.getByRole("button", { name: "Definir senha e continuar" }).click();

    await expect(page.locator(".auth-error")).toHaveText(
      "Link inválido ou expirado. Peça um novo convite ao administrador.",
    );
  });

  test("requesting a reset for an unregistered e-mail returns the same generic confirmation", async ({
    page,
  }) => {
    await page.goto("/auth/reset");
    await page.getByLabel("E-mail", { exact: true }).fill(`no-such-user.${Date.now()}@plugga.local`);
    await page.getByRole("button", { name: "Enviar link de redefinição" }).click();

    await expect(page.locator(".auth-success")).toHaveText(
      "Se este e-mail estiver cadastrado, enviaremos um link para redefinir a senha.",
    );
  });

  test("an invalid reset token shows a generic error", async ({ page }) => {
    await page.goto("/auth/reset?token=not-a-real-reset-token-000000000000");
    await page.getByLabel("Nova senha").fill("a-perfectly-fine-password-1");
    await page.getByLabel("Confirmar senha").fill("a-perfectly-fine-password-1");
    await page.getByRole("button", { name: "Redefinir senha" }).click();

    await expect(page.locator(".auth-error")).toHaveText("Link inválido ou expirado. Peça uma nova redefinição.");
  });
});
