import { expect, test, type Page } from "@playwright/test";

/**
 * Login Google — a NOSSA metade do fluxo.
 *
 * O Google real não entra aqui: autenticação de terceiro na CI seria um teste
 * da internet, não do produto. O script do GIS é interceptado, e o que estes
 * casos provam é o que quebraria em silêncio se ninguém olhasse — o botão
 * aparecer com a configuração certa, o script falhar sem levar o login por
 * senha junto, a recusa virar uma mensagem genérica, e o deep link voltar sem
 * abrir redirect para fora.
 */

const GIS_SCRIPT = "https://accounts.google.com/gsi/client";

/**
 * A mensagem de erro do formulário. Localizada pela classe, e não por
 * `getByRole("alert")`: o Next mantém um anunciador de rota invisível com o
 * mesmo papel, e o modo estrito do Playwright recusa os dois juntos.
 */
const erro = (page: Page) => page.locator("p.auth-error-msg");

/** Substitui o script do Google por um que só marca presença no DOM. */
const STUB_SCRIPT = `
  window.__gisLoaded = true;
  document.querySelectorAll(".g_id_signin").forEach((slot) => {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.textContent = "Fazer login com o Google";
    slot.appendChild(botao);
  });
`;

test.describe("Login Google — tela de entrada", () => {
  // Estes casos precisam começar deslogados: com sessão o /login redireciona.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("o botão oficial é renderizado com o client id e o callback configurados", async ({
    page,
  }) => {
    await page.route(`${GIS_SCRIPT}*`, (route) =>
      route.fulfill({ contentType: "text/javascript", body: STUB_SCRIPT }),
    );

    await page.goto("/login");

    const onload = page.locator("#g_id_onload");
    await expect(onload).toHaveAttribute("data-client_id", "e2e-only.apps.googleusercontent.com");
    await expect(onload).toHaveAttribute(
      "data-login_uri",
      "http://127.0.0.1:3000/api/auth/google/callback",
    );
    // Redirect, não popup — foi a escolha de produto, e ela vive num atributo.
    await expect(onload).toHaveAttribute("data-ux_mode", "redirect");
    // One Tap está fora do escopo: prompt automático não pode voltar por acidente.
    await expect(onload).toHaveAttribute("data-auto_prompt", "false");

    await expect(page.getByRole("button", { name: "Fazer login com o Google" })).toBeVisible();
    // A largura é medida do wrapper, então tem de ser um número, nunca "100%".
    const largura = await page.locator(".g_id_signin").getAttribute("data-width");
    expect(Number(largura)).toBeGreaterThan(0);
  });

  test("script do Google bloqueado derruba só o botão; e-mail e senha continuam", async ({
    page,
  }) => {
    await page.route(`${GIS_SCRIPT}*`, (route) => route.abort());
    // A recusa é simulada em vez de pedida à API: o que este caso prova é que o
    // formulário continua inteiro sem o Google, e gastar uma tentativa real
    // consumiria o teto de 10/min por IP que a suíte divide com os outros specs.
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
    );

    await page.goto("/login");

    await expect(page.locator(".auth-google-slot")).toHaveCount(0);
    // O caminho principal segue inteiro: campos, botão e mensagem de erro.
    await page.getByLabel("E-mail", { exact: true }).fill("alguem@plugga.local");
    await page.getByLabel("Senha", { exact: true }).fill("senha-errada-mesmo");
    await page.getByRole("button", { name: "Fazer login" }).click();
    await expect(erro(page)).toHaveText("E-mail ou senha inválidos.");
  });

  test("a recusa do Google vira mensagem genérica, sem vazar detalhe", async ({ page }) => {
    await page.route(`${GIS_SCRIPT}*`, (route) => route.abort());

    await page.goto("/login?googleError=unauthorized");

    const alerta = erro(page);
    // Uma frase só, igual para token inválido, conta desconhecida, conta
    // desativada e colisão de vínculo: distinguir seria dizer a quem está de
    // fora se aquela conta existe aqui dentro.
    await expect(alerta).toHaveText("Não foi possível entrar com esta conta Google.");
  });

  test("um código de erro inventado cai no genérico em vez de aparecer na tela", async ({
    page,
  }) => {
    await page.route(`${GIS_SCRIPT}*`, (route) => route.abort());

    await page.goto("/login?googleError=conta-da-fulana-esta-desativada");

    await expect(erro(page)).toHaveText("Não foi possível entrar com esta conta Google.");
    await expect(page.locator("body")).not.toContainText("fulana");
  });

  test("indisponibilidade do Google aponta para o login por senha", async ({ page }) => {
    await page.route(`${GIS_SCRIPT}*`, (route) => route.abort());

    await page.goto("/login?googleError=unavailable");

    await expect(erro(page)).toContainText("temporariamente indisponível");
    await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  });

  test("a política de privacidade abre sem sessão — o Google precisa alcançá-la", async ({
    page,
  }) => {
    await page.goto("/privacidade");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Política de privacidade");
    await expect(page.locator("body")).toContainText("Gmail");
    expect(new URL(page.url()).pathname).toBe("/privacidade");
  });

  test("a página de conclusão não é alcançável sem sessão", async ({ page }) => {
    await page.goto("/auth/google/complete");

    await page.waitForURL((url) => url.pathname === "/login");
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});

test.describe("Login Google — volta do callback", () => {
  test("o destino profundo guardado antes da ida é restaurado", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() =>
      window.sessionStorage.setItem("plugga.googleRedirectTo", "/energia-opm/ciclos"),
    );

    await page.goto("/auth/google/complete");

    await page.waitForURL((url) => url.pathname === "/energia-opm/ciclos");
    // Consumido: um segundo login não pode herdar o destino do anterior.
    const restante = await page.evaluate(() =>
      window.sessionStorage.getItem("plugga.googleRedirectTo"),
    );
    expect(restante).toBeNull();
  });

  test("um destino externo guardado no armazenamento não vira redirect para fora", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/");
    await page.evaluate(() =>
      window.sessionStorage.setItem("plugga.googleRedirectTo", "//exemplo-malicioso.test/"),
    );

    await page.goto("/auth/google/complete");

    await page.waitForURL((url) => url.pathname === "/");
    // Continua no host da aplicação: o valor guardado não escolheu o destino.
    expect(new URL(page.url()).host).toBe(new URL(baseURL ?? "").host);
  });

  test("sem destino guardado, a volta é para o início", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.sessionStorage.removeItem("plugga.googleRedirectTo"));

    await page.goto("/auth/google/complete");

    await page.waitForURL((url) => url.pathname === "/");
  });
});
