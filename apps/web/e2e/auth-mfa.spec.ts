import { expect, test } from "@playwright/test";
import { bloquearTerceiros } from "./support/sem-terceiros";

test.use({ storageState: { cookies: [], origins: [] } });
test.beforeEach(async ({ page }) => { await bloquearTerceiros(page); });

async function pending(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/mfa/challenge", (route) => route.fulfill({ json: { pending: true, expiresAt: new Date(Date.now() + 300_000).toISOString() } }));
}

test("autenticação usa a General Sans do projeto nos avisos, rótulos e campos em desktop e celular", async ({ page }) => {
  await pending(page);
  for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const path of ["/auth/mfa", "/login", "/auth/reset?token=synthetic-preview-token"]) {
      await page.goto(path);
      await page.getByRole("heading", { level: 1 }).waitFor();
      if (path === "/auth/mfa") await page.getByLabel("Código de verificação ou recuperação").waitFor();
      await page.evaluate(() => document.fonts.ready);
      const typography = await page.evaluate(() => {
        const family = (value: string) => value.split(",")[0]!.replace(/["']/g, "").trim();
        const expected = [
          family(getComputedStyle(document.documentElement).getPropertyValue("--font-general-sans")),
          family(getComputedStyle(document.body).fontFamily),
        ];
        const selector = ".auth-form-title, .auth-form-subtitle, .auth-card-footer, .auth-pill-input, .auth-pill-label, .auth-legal-notice, .auth-reset-hint, .auth-reset-status, .ui-field label, .ui-required, .ui-field-hint, .ui-input, .ui-button";
        return {
          expected,
          loaded: expected.every((name) => [...document.fonts].some((font) => family(font.family) === name && font.status === "loaded")),
          elements: [...document.querySelectorAll(selector)].map((node) => ({ element: node.className || node.tagName, family: family(getComputedStyle(node).fontFamily) })),
        };
      });
      expect(typography.expected.every(Boolean)).toBe(true);
      expect(typography.loaded).toBe(true);
      expect(typography.elements.length).toBeGreaterThan(5);
      expect(typography.elements.filter((item) => !typography.expected.includes(item.family)), `${path} em ${viewport.width}px`).toEqual([]);
    }
  }
});

test("nova tentativa de carregar o desafio remove o erro anterior após recuperar a conexão", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/auth/mfa/challenge", async (route) => {
    attempts += 1;
    await route.fulfill({ status: attempts === 1 ? 503 : 200, json: attempts === 1 ? {} : { pending: true, expiresAt: new Date(Date.now() + 300_000).toISOString() } });
  });
  await page.goto("/auth/mfa");
  const error = page.getByRole("alert").filter({ hasText: "Tente novamente" });
  await expect(error).toBeVisible();
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByLabel("Código de verificação ou recuperação")).toBeVisible();
  await expect(error).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("senha com 2FA exige desafio antes de acessar o destino e mantém opção de permanência", async ({ page }) => {
  await pending(page);
  let login: unknown;
  await page.route("**/api/auth/login", async (route) => {
    login = route.request().postDataJSON();
    await route.fulfill({ json: { requiresMfa: true } });
  });
  await page.goto("/login?redirectTo=%2Ftermos");
  await page.getByLabel("E-mail", { exact: true }).fill("mfa@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("synthetic-password");
  await page.getByText("Mantenha-me conectado", { exact: true }).click();
  await page.getByRole("button", { name: "Fazer login", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/mfa\?redirectTo=%2Ftermos/);
  await expect(page.getByRole("heading", { name: "Confirme seu acesso" })).toBeVisible();
  expect(login).toMatchObject({ rememberMe: true });
});

test("desafio aceita código de recuperação, mostra erro recuperável e só navega após validar", async ({ page }) => {
  await pending(page);
  let attempts = 0;
  await page.route("**/api/auth/mfa/verify", async (route) => {
    attempts += 1;
    expect(route.request().postDataJSON()).toEqual({ code: "ABCD-EFGH-IJKL" });
    await route.fulfill({ status: attempts === 1 ? 401 : 200, json: attempts === 1 ? {} : { user: { id: "synthetic" } } });
  });
  await page.goto("/auth/mfa?redirectTo=%2Ftermos");
  await page.getByLabel("Código de verificação ou recuperação").fill("ABCD-EFGH-IJKL");
  await page.getByRole("button", { name: "Confirmar e entrar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Código inválido ou expirado" })).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/mfa/);
  await page.getByRole("button", { name: "Confirmar e entrar" }).click();
  await expect(page).toHaveURL(/\/termos$/);
});

test("pendência expirada orienta novo login e cancelar invalida o acesso pendente", async ({ page }) => {
  await page.route("**/api/auth/mfa/challenge", (route) => route.fulfill({ json: { pending: false, expiresAt: null } }));
  await page.goto("/auth/mfa");
  await expect(page.getByText("Solicitação encerrada", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar e entrar" })).toHaveCount(0);
  await pending(page);
  let cancelled = false;
  await page.route("**/api/auth/mfa/cancel", async (route) => { cancelled = true; await route.fulfill({ json: { ok: true } }); });
  await page.reload();
  await page.getByRole("button", { name: "Cancelar acesso" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(cancelled).toBe(true);
});

test("desafio é utilizável por teclado e cabe em 320px", async ({ page }) => {
  await pending(page);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/auth/mfa");
  const input = page.getByLabel("Código de verificação ou recuperação");
  await input.focus();
  const outline = await input.evaluate((node) => {
    const style = getComputedStyle(node.parentElement!);
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(outline.style).not.toBe("none");
  expect(outline.width).toBeGreaterThanOrEqual(2);
  await input.press("Tab");
  await expect(page.getByRole("button", { name: "Confirmar e entrar" })).toBeFocused();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
