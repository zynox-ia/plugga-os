import { expect, test } from "@playwright/test";

test("deep link pessoal permite trocar abas pelo mouse e teclado", async ({ page }) => {
  await page.route("**/api/auth/mfa/status", (route) => route.fulfill({ json: { enabled: false, recentlyVerified: false, recoveryCodesRemaining: 0 } }));
  await page.goto("/configuracoes?aba=seguranca");
  const perfil = page.getByRole("tab", { name: "Perfil", exact: true });
  const seguranca = page.getByRole("tab", { name: "Segurança", exact: true });
  const notificacoes = page.getByRole("tab", { name: "Notifica\u00e7\u00f5es", exact: true });
  await expect(seguranca).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Segurança");
  await expect(page.getByRole("region", { name: "Autenticação em duas etapas", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Identificação e contato", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Senha Atual", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Senha Atual", { exact: true })).toHaveValue("");
  await page.reload();
  await expect(seguranca).toHaveAttribute("aria-selected", "true");
  await notificacoes.click();
  await expect(notificacoes).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName("Notifica\u00e7\u00f5es");
  await expect(page.getByRole("button", { name: "Salvar prefer\u00eancias" })).toBeDisabled();
  await notificacoes.press("ArrowLeft");
  await expect(seguranca).toBeFocused();
  await expect(seguranca).toHaveAttribute("aria-selected", "true");
  await seguranca.press("ArrowLeft");
  await expect(perfil).toBeFocused();
  await expect(perfil).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Identificação e contato", exact: true })).toBeVisible();
  await expect(page.getByLabel("Senha Atual", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Autenticação em duas etapas", exact: true })).toHaveCount(0);
  await perfil.press("ArrowRight");
  await expect(seguranca).toBeFocused();
  await seguranca.press("ArrowRight");
  await expect(notificacoes).toBeFocused();
  await expect(notificacoes).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(notificacoes).toHaveAttribute("aria-selected", "true");
});

test("Perfil não consulta MFA e links antigos não exibem os campos de sistema", async ({ page }) => {
  let mfaRequests = 0;
  await page.route("**/api/auth/mfa/status", (route) => {
    mfaRequests += 1;
    return route.fulfill({ json: { enabled: false, recentlyVerified: false, recoveryCodesRemaining: 0 } });
  });
  for (const viewport of [{ width: 1366, height: 960 }, { width: 320, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/configuracoes?aba=perfil");
    await expect(page.getByRole("tab", { name: "Perfil", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("region", { name: "Identificação e contato", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Configurações do Sistema", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Abrir menu da conta" }).click();
    await expect(page.getByRole("menuitem", { name: "Configurações do sistema", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.goto("/configuracoes?aba=sistema");
    await expect(page.getByRole("tab", { name: "Perfil", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("region", { name: "Parâmetros da organização", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Políticas do CRM", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Armazenamento e arquivos", exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(mfaRequests).toBe(0);
});

test("Segurança alinha senha e 2FA na mesma linha e empilha os cartões no celular", async ({ page }) => {
  await page.route("**/api/auth/mfa/status", (route) => route.fulfill({ json: { enabled: false, recentlyVerified: false, recoveryCodesRemaining: 0 } }));
  await page.route("**/api/auth/mfa/setup", (route) => route.fulfill({ json: {
    secret: "JBSWY3DPEHPK3PXP", otpauthUri: "otpauth://totp/Plugga:preview?secret=JBSWY3DPEHPK3PXP&issuer=Plugga",
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  } }));
  for (const viewport of [{ width: 1366, height: 960 }, { width: 320, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/configuracoes?aba=seguranca");
    const password = page.getByRole("region", { name: "Segurança e senha", exact: true });
    const mfa = page.getByRole("region", { name: "Autenticação em duas etapas", exact: true });
    await expect(password).toBeVisible();
    await expect(mfa).toBeVisible();
    await expect(password.getByText("Alteração de senha em preparação", { exact: true })).toHaveCount(0);
    await expect(password.getByText("A troca de senha nesta tela ainda não está disponível.", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Dados da sessão atual", exact: true })).toHaveCount(0);
    const left = await password.boundingBox();
    const right = await mfa.boundingBox();
    if (viewport.width > 767) {
      expect(Math.abs(left!.y - right!.y)).toBeLessThan(2);
      expect(right!.x).toBeGreaterThanOrEqual(left!.x + left!.width);
    } else {
      expect(right!.y).toBeGreaterThanOrEqual(left!.y + left!.height);
    }
    await mfa.getByRole("button", { name: "Ativar autenticação em duas etapas", exact: true }).click();
    await expect(mfa.getByRole("img", { name: /QR code/ })).toBeVisible();
    await expect(mfa.getByLabel("Código do aplicativo")).toBeVisible();
    expect(await mfa.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
});

test("cada seção de Configurações apresenta título H1 e subtítulo H2 no topo", async ({ page }) => {
  await page.route("**/api/auth/mfa/status", (route) => route.fulfill({ json: { enabled: false, recentlyVerified: false, recoveryCodesRemaining: 0 } }));
  for (const viewport of [{ width: 1366, height: 960 }, { width: 320, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/configuracoes?aba=perfil");
    await expect(page.getByRole("tab", { name: "Perfil", exact: true })).toHaveAttribute("aria-selected", "true");
    const sections = await page.getByRole("tab").allTextContents();
    for (const section of sections) {
      await page.getByRole("tab", { name: section, exact: true }).click();
      const title = page.getByRole("heading", { level: 1 });
      await expect(title).toHaveText(section);
      const header = page.locator("header").filter({ has: title });
      await expect(header.getByRole("heading", { level: 2 })).not.toBeEmpty();
      expect(await header.evaluate((node) => node.scrollWidth <= node.clientWidth), `${section} em ${viewport.width}px`).toBe(true);
    }
  }
});
