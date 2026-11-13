import { expect, test, type Page } from "@playwright/test";

const SECRET = "JBSWY3DPEHPK3PXP";
const CODES = ["AAAA-BBBB-CCCC", "DDDD-EEEE-FFFF"];

async function status(page: Page, enabled = false, recentlyVerified = false) {
  await page.route("**/api/auth/mfa/status", (route) => route.fulfill({ json: { enabled, recentlyVerified, recoveryCodesRemaining: enabled ? 2 : 0 } }));
}

test("cópia só confirma sucesso após o navegador aceitar e oferece alternativa quando falha", async ({ page }) => {
  await page.addInitScript(() => {
    let attempts = 0;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async () => {
        attempts += 1;
        if (attempts % 2 === 1) throw new DOMException("Permission denied", "NotAllowedError");
      },
    } });
  });
  await status(page);
  await page.route("**/api/auth/mfa/setup", (route) => route.fulfill({ json: { secret: SECRET, otpauthUri: `otpauth://totp/Plugga:test?secret=${SECRET}`, expiresAt: new Date(Date.now() + 300_000).toISOString() } }));
  await page.route("**/api/auth/mfa/enable", (route) => route.fulfill({ json: { recoveryCodes: CODES } }));
  await page.goto("/configuracoes?aba=seguranca");
  const security = page.getByRole("region", { name: "Autenticação em duas etapas", exact: true });
  await security.getByRole("button", { name: "Ativar autenticação em duas etapas" }).click();
  await expect(security.getByRole("button", { name: "Copiar chave" })).toHaveCount(0);
  await security.getByLabel("Código do aplicativo").fill("123456");
  await security.getByRole("button", { name: "Confirmar primeiro código" }).click();
  await security.getByRole("button", { name: "Copiar códigos", exact: true }).click();
  await expect(security.getByText(/Baixe os códigos ou selecione-os e copie manualmente/)).toBeVisible();
  await expect(security.getByRole("button", { name: "Códigos copiados", exact: true })).toHaveCount(0);
  await expect(security.getByRole("button", { name: "Baixar códigos", exact: true })).toBeVisible();
  await security.getByRole("button", { name: "Copiar códigos", exact: true }).click();
  await expect(security.getByRole("button", { name: "Códigos copiados", exact: true })).toBeVisible();
});

test("ativação só conclui com primeiro TOTP e códigos são apresentados uma vez com salvamento", async ({ page }) => {
  await status(page);
  await page.route("**/api/auth/mfa/setup", (route) => route.fulfill({ json: { secret: SECRET, otpauthUri: `otpauth://totp/Plugga:test?secret=${SECRET}&issuer=Plugga`, expiresAt: new Date(Date.now() + 300_000).toISOString() } }));
  let attempts = 0;
  await page.route("**/api/auth/mfa/enable", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ code: "123456" });
    attempts += 1;
    await route.fulfill({ status: attempts === 1 ? 401 : 200, json: attempts === 1 ? {} : { recoveryCodes: CODES } });
  });
  await page.goto("/configuracoes?aba=seguranca");
  const security = page.getByRole("region", { name: "Autenticação em duas etapas", exact: true });
  await security.getByRole("button", { name: "Ativar autenticação em duas etapas" }).click();
  await expect(security.getByLabel("Chave para configuração manual", { exact: true })).toHaveValue(SECRET);
  await expect(security.getByRole("img", { name: /QR code/ })).toBeVisible();
  await expect(security.getByText("Desativada", { exact: true })).toBeVisible();
  await security.getByLabel("Código do aplicativo").fill("123456");
  await security.getByRole("button", { name: "Confirmar primeiro código" }).click();
  await expect(security.getByRole("alert")).toContainText("Código inválido");
  await expect(security.getByText(CODES[0]!, { exact: true })).toHaveCount(0);
  await security.getByLabel("Código do aplicativo").fill("123456");
  await security.getByRole("button", { name: "Confirmar primeiro código" }).click();
  await expect(security.getByText("Ativada", { exact: true })).toBeVisible();
  await expect(security.getByText(CODES[0]!, { exact: true })).toBeVisible();
  await expect(security.getByLabel("Chave para configuração manual", { exact: true })).toHaveCount(0);
  await expect(security.getByRole("button", { name: "Concluir", exact: true })).toBeDisabled();
  const download = page.waitForEvent("download");
  await security.getByRole("button", { name: "Baixar códigos" }).click();
  expect((await download).suggestedFilename()).toBe("plugga-codigos-de-recuperacao.txt");
  await security.getByLabel("Guardei os códigos em um local seguro", { exact: true }).check();
  await security.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(security.getByText(CODES[0]!, { exact: true })).toHaveCount(0);
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain(SECRET);
  for (const code of CODES) expect(storage).not.toContain(code);
});

test("ações sensíveis confirmam o fator e repetem confirmação se a janela de cinco minutos acabou", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await status(page, true, true);
  let disable = 0;
  let confirm = 0;
  await page.route("**/api/auth/mfa/disable", async (route) => { disable += 1; await route.fulfill({ status: disable === 1 ? 403 : 200, json: { ok: disable > 1 } }); });
  await page.route("**/api/auth/mfa/confirm", async (route) => { confirm += 1; expect(route.request().postDataJSON()).toEqual({ code: "AAAA-BBBB-CCCC" }); await route.fulfill({ json: { ok: true } }); });
  await page.goto("/configuracoes?aba=seguranca");
  await page.getByRole("button", { name: "Desativar proteção", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Desativar autenticação em duas etapas", exact: true });
  const title = dialog.getByRole("heading", { name: "Desativar autenticação em duas etapas", exact: true });
  await expect(title).toBeVisible();
  expect(await title.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await expect(dialog.getByLabel("Código de verificação ou recuperação")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Desativar proteção", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Confirme o segundo fator");
  await dialog.getByLabel("Código de verificação ou recuperação").fill("AAAA-BBBB-CCCC");
  await dialog.getByRole("button", { name: "Desativar proteção", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Desativada", { exact: true })).toBeVisible();
  expect(confirm).toBe(1);
});

test("falha de status nunca é tratada como proteção desativada", async ({ page }) => {
  await page.route("**/api/auth/mfa/status", (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto("/configuracoes?aba=seguranca");
  const security = page.getByRole("region", { name: "Autenticação em duas etapas", exact: true });
  await expect(security.getByRole("alert")).toContainText("Tente novamente");
  await expect(security.getByRole("button", { name: "Ativar autenticação em duas etapas" })).toHaveCount(0);
  await status(page);
  await security.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(security.getByRole("button", { name: "Ativar autenticação em duas etapas" })).toBeVisible();
});

test("primeira ativação com sessão antiga pede novo login e preserva o destino de segurança", async ({ page }) => {
  await status(page);
  await page.route("**/api/auth/mfa/setup", (route) => route.fulfill({ status: 403, json: { message: "Entre novamente para configurar a autenticação em duas etapas." } }));
  let logout = false;
  await page.route("**/api/auth/logout", async (route) => { logout = true; await route.fulfill({ json: { ok: true }, headers: { "set-cookie": "plugga_session=; Path=/; Max-Age=0" } }); });
  await page.goto("/configuracoes?aba=seguranca");
  await page.getByRole("button", { name: "Ativar autenticação em duas etapas" }).click();
  await expect(page.getByRole("region", { name: "Autenticação em duas etapas", exact: true }).getByRole("alert")).toContainText("Entre novamente");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Sair e entrar novamente" }).click();
  await expect(page).toHaveURL(/\/login\?redirectTo=%2Fconfiguracoes%3Faba%3Dseguranca/);
  expect(logout).toBe(true);
});

test("troca pode ser abandonada e regeneração mostra apenas os novos códigos sem repetir fator recente", async ({ page }) => {
  await status(page, true, false);
  let confirmations = 0;
  await page.route("**/api/auth/mfa/confirm", async (route) => { confirmations += 1; expect(route.request().postDataJSON()).toEqual({ code: "123456" }); await route.fulfill({ json: { ok: true } }); });
  await page.route("**/api/auth/mfa/setup", (route) => route.fulfill({ json: { secret: SECRET, otpauthUri: `otpauth://totp/Plugga:test?secret=${SECRET}`, expiresAt: new Date(Date.now() + 300_000).toISOString() } }));
  await page.route("**/api/auth/mfa/recovery-codes", (route) => route.fulfill({ json: { recoveryCodes: ["NEW1-NEW2-NEW3"] } }));
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/configuracoes?aba=seguranca");
  await page.getByRole("button", { name: "Trocar autenticador", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Trocar aplicativo autenticador", exact: true });
  await dialog.getByLabel("Código de verificação ou recuperação").fill("123456");
  await dialog.getByRole("button", { name: "Configurar novo app" }).click();
  await expect(page.getByLabel("Chave para configuração manual", { exact: true })).toHaveValue(SECRET);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Cancelar configuração" }).click();
  await expect(page.getByText("Ativada", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Chave para configuração manual", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Gerar novos códigos", exact: true }).click();
  const regenerate = page.getByRole("dialog", { name: "Gerar novos códigos de recuperação", exact: true });
  await expect(regenerate.getByLabel("Código de verificação ou recuperação")).toHaveCount(0);
  await regenerate.getByRole("button", { name: "Gerar novos códigos", exact: true }).click();
  await expect(page.getByText("NEW1-NEW2-NEW3", { exact: true })).toBeVisible();
  expect(confirmations).toBe(1);
});
