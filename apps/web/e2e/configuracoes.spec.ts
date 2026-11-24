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
  await expect(page.getByLabel("Senha atual", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Senha atual", { exact: true })).toHaveValue("");
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
  await expect(page.getByLabel("Senha atual", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Autenticação em duas etapas", exact: true })).toHaveCount(0);
  await perfil.press("ArrowRight");
  await expect(seguranca).toBeFocused();
  await seguranca.press("ArrowRight");
  await expect(notificacoes).toBeFocused();
  await expect(notificacoes).toHaveAttribute("aria-selected", "true");
  await page.reload();
  await expect(notificacoes).toHaveAttribute("aria-selected", "true");
});

test("troca de senha: valida na tela, mostra a recusa do servidor e confirma o sucesso", async ({ page }) => {
  await page.route("**/api/auth/mfa/status", (route) => route.fulfill({ json: { enabled: false, recentlyVerified: false, recoveryCodesRemaining: 0 } }));
  const pedidos: unknown[] = [];
  let resposta: { status: number; json: object } = { status: 400, json: { message: "A senha atual não confere." } };
  await page.route("**/api/auth/password", (route) => {
    pedidos.push(route.request().postDataJSON());
    return route.fulfill(resposta);
  });
  await page.goto("/configuracoes?aba=seguranca");
  const atual = page.getByLabel("Senha atual", { exact: true });
  const nova = page.getByLabel("Nova senha", { exact: true });
  const confirmacao = page.getByLabel("Confirmar nova senha", { exact: true });
  const enviar = page.getByRole("button", { name: "Atualizar senha" });

  await enviar.click();
  await expect(page.getByText("Informe a senha atual.")).toBeVisible();
  expect(pedidos).toHaveLength(0);

  await atual.fill("senha-atual-qualquer");
  await nova.fill("curta");
  await enviar.click();
  await expect(page.getByText("Use pelo menos 12 caracteres.")).toBeVisible();
  await nova.fill("frase nova bem comprida");
  await confirmacao.fill("frase diferente da nova");
  await enviar.click();
  await expect(page.getByText("As senhas não são iguais.")).toBeVisible();
  expect(pedidos).toHaveLength(0);

  await confirmacao.fill("frase nova bem comprida");
  await enviar.click();
  await expect(page.getByRole("alert").filter({ hasText: "A senha atual não confere." })).toBeVisible();
  expect(pedidos).toEqual([{ currentPassword: "senha-atual-qualquer", newPassword: "frase nova bem comprida" }]);

  resposta = { status: 200, json: { ok: true } };
  await enviar.click();
  await expect(page.getByText("Senha atualizada.")).toBeVisible();
  await expect(atual).toHaveValue("");
  await expect(nova).toHaveValue("");
});

test("Notificações é uma tabela com duas colunas: no sistema e por e-mail", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 960 });
  await page.goto("/configuracoes?aba=notificacoes");
  const tabela = page.getByRole("table", { name: "Quando ser avisado, em cada canal" });
  await expect(tabela.getByRole("columnheader", { name: "No sistema" })).toBeVisible();
  await expect(tabela.getByRole("columnheader", { name: "Por e-mail" })).toBeVisible();
  await expect(tabela.getByRole("row")).toHaveCount(6);
  await expect(tabela.getByRole("switch")).toHaveCount(8);
  const leadsNoSistema = tabela.getByRole("switch", { name: "Novos leads atribuídos, no sistema" });
  await expect(leadsNoSistema).toBeChecked();
  await expect(leadsNoSistema).toBeDisabled();
  await expect(tabela.getByRole("switch", { name: "Novos leads atribuídos, por e-mail" })).not.toBeChecked();
  // O resumo semanal só existe no e-mail; o avanço de etapas, só no sistema.
  await expect(tabela.getByRole("switch", { name: /Resumo semanal, no sistema/ })).toHaveCount(0);
  await expect(tabela.getByRole("switch", { name: /Resumo semanal, por e-mail/ })).toHaveCount(1);
  await expect(tabela.getByRole("switch", { name: /Avanço de etapas no pipeline, por e-mail/ })).toHaveCount(0);
  // As duas colunas ficam lado a lado, cada chave na coluna do seu canal.
  const titulos = {
    sistema: (await tabela.getByRole("columnheader", { name: "No sistema" }).boundingBox())!,
    email: (await tabela.getByRole("columnheader", { name: "Por e-mail" }).boundingBox())!,
  };
  const sistemaBox = (await leadsNoSistema.boundingBox())!;
  const emailBox = (await tabela.getByRole("switch", { name: "Novos leads atribuídos, por e-mail" }).boundingBox())!;
  expect(sistemaBox.x).toBeGreaterThanOrEqual(titulos.sistema.x);
  expect(sistemaBox.x + sistemaBox.width).toBeLessThanOrEqual(titulos.sistema.x + titulos.sistema.width);
  expect(emailBox.x).toBeGreaterThanOrEqual(titulos.email.x);
  expect(emailBox.x).toBeGreaterThan(sistemaBox.x);
  await expect(page.getByRole("button", { name: "Salvar preferências", exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
    const titleBox = await mfa.getByRole("heading", { name: "Autenticação em duas etapas", exact: true }).boundingBox();
    const badge = mfa.getByText("Desativada", { exact: true });
    await expect(badge).toBeVisible();
    const badgeBox = await badge.boundingBox();
    expect(badgeBox!.x).toBeGreaterThanOrEqual(titleBox!.x + titleBox!.width);
    expect(Math.abs((badgeBox!.y + badgeBox!.height / 2) - (titleBox!.y + titleBox!.height / 2))).toBeLessThan(2);
    await expect(password.getByText("Alteração de senha em preparação", { exact: true })).toHaveCount(0);
    await expect(password.getByText("A troca de senha nesta tela ainda não está disponível.", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Dados da sessão atual", exact: true })).toHaveCount(0);
    const left = await mfa.boundingBox();
    const right = await password.boundingBox();
    if (viewport.width > 960) {
      // Cartões lado a lado: mesmo topo e mesma altura (equilíbrio).
      expect(Math.abs(left!.y - right!.y)).toBeLessThan(2);
      expect(Math.abs(left!.height - right!.height)).toBeLessThan(2);
      expect(right!.x).toBeGreaterThanOrEqual(left!.x + left!.width);
    } else {
      expect(right!.y).toBeGreaterThanOrEqual(left!.y + left!.height);
    }
    const ativar = mfa.getByRole("button", { name: "Ativar autenticação em duas etapas", exact: true });
    const alturaAntes = (await mfa.boundingBox())!.height;
    if (viewport.width > 960) {
      // "Ativar" e "Atualizar senha" ficam alinhados na base dos cartões.
      const baseAtivar = (await ativar.boundingBox())!;
      const baseSenha = (await password.getByRole("button", { name: "Atualizar senha", exact: true }).boundingBox())!;
      expect(Math.abs(baseAtivar.y + baseAtivar.height - (baseSenha.y + baseSenha.height))).toBeLessThan(2);
    }
    await ativar.click();
    await expect(mfa.getByRole("img", { name: /QR code/ })).toBeVisible();
    if (viewport.width > 960) {
      // Configurar o autenticador não aumenta o cartão: o layout fica dentro do mesmo espaço.
      expect(Math.abs((await mfa.boundingBox())!.height - alturaAntes)).toBeLessThan(2);
      expect(Math.abs((await password.boundingBox())!.height - alturaAntes)).toBeLessThan(2);
    }
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

test("Perfil agrupa os dados em um cartão responsivo e preserva a consulta da conta", async ({ page, request }) => {
  const response = await request.get("/api/auth/me");
  expect(response.status()).toBe(200);
  const user = await response.json();
  const name = "Alexandre de Oliveira Albuquerque da Silva e Souza";
  const email = `alexandre.${"a".repeat(40)}@departamento.example.test`;
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: { ...user, name, email } }));
  for (const viewport of [{ width: 1366, height: 960 }, { width: 320, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/configuracoes?aba=perfil");
    const identity = page.getByRole("region", { name: "Identificação e contato", exact: true });
    const profile = page.getByRole("region", { name: "Informações pessoais", exact: true });
    const nameField = profile.getByLabel("Nome Completo", { exact: true });
    const emailField = profile.getByLabel("E-mail", { exact: true });
    const phoneField = profile.getByLabel("Celular / WhatsApp", { exact: true });
    await expect(nameField).toHaveValue(name);
    await expect(emailField).toHaveValue(email);
    await expect(nameField).toHaveAttribute("readonly", "");
    await expect(emailField).toHaveAttribute("readonly", "");
    await expect(phoneField).toBeDisabled();
    await expect(profile.getByRole("button", { name: "Salvar perfil", exact: true })).toBeDisabled();
    await expect(identity.getByText(name, { exact: true })).toBeVisible();
    await expect(profile.getByRole("alert")).toHaveCount(0);
    await expect(profile.locator('input[type="file"]')).toHaveCount(0);
    const emailBox = await emailField.boundingBox();
    const phoneBox = await phoneField.boundingBox();
    if (viewport.width > 767) {
      expect(Math.abs(emailBox!.y - phoneBox!.y)).toBeLessThan(2);
      expect(phoneBox!.x).toBeGreaterThanOrEqual(emailBox!.x + emailBox!.width);
    } else {
      expect(phoneBox!.y).toBeGreaterThan(emailBox!.y);
    }
    expect(await profile.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.getByRole("tabpanel").focus();
    await page.keyboard.press("Tab");
    await expect(nameField).toBeFocused();
    expect(await nameField.evaluate((node) => getComputedStyle(node.parentElement!).outlineStyle)).toBe("solid");
  }
});
