import { expect, test } from "@playwright/test";

/**
 * Erro real aparece como erro, nunca como tela vazia ou dado inventado.
 *
 * Dois grupos:
 *  - contra a pilha real (API + banco do CI): registro inexistente, que só
 *    depende de a API responder 404;
 *  - contra a API simulada (`e2e/support/api-simulada.mjs`): indisponível,
 *    acesso negado e sessão inválida, que não dá para provocar de forma
 *    determinística com a API real. Esse grupo só roda com
 *    `E2E_WEB_SIMULADO_URL` apontando para um web iniciado com
 *    `API_INTERNAL_URL` da API simulada (instruções no cabeçalho do stub).
 */

const UUID_INEXISTENTE = "00000000-0000-4000-8000-00000000ffff";

test.describe("Registro inexistente", () => {
  test("UUID que não existe mostra 'não encontrado', não 'indisponível'", async ({ page }) => {
    await page.goto(`/comercial/contratos/${UUID_INEXISTENTE}`);
    await expect(page.getByTestId("estado-api-naoEncontrado")).toContainText("não encontrado", { ignoreCase: true });
    await expect(page.getByTestId("estado-api-indisponivel")).toHaveCount(0);
  });

  test("identificador que não é UUID é recusado como não encontrado, sem erro de servidor", async ({ page }) => {
    const resposta = await page.goto("/comercial/contratos/abc-nao-uuid");
    expect(resposta?.status()).toBeLessThan(500);
    await expect(page.getByTestId("estado-api-naoEncontrado")).toBeVisible();
  });

  test("a rota de API recusa identificador malformado com 400 antes de chamar a API", async ({ request }) => {
    const resposta = await request.post("/api/commercial/opportunities/nao-e-uuid/lose", { data: {} });
    expect(resposta.status()).toBe(400);
  });
});

test.describe("API simulada: cada falha tem a sua tela", () => {
  const baseSimulada = process.env.E2E_WEB_SIMULADO_URL;
  test.skip(!baseSimulada, "defina E2E_WEB_SIMULADO_URL (web apontando para e2e/support/api-simulada.mjs)");
  test.use({ baseURL: baseSimulada, storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ context, baseURL }) => {
    // O stub aceita qualquer cookie; o middleware só exige que ele exista.
    await context.addCookies([{ name: "plugga_session", value: "simulada", url: baseURL ?? "http://127.0.0.1:3100" }]);
  });

  test("API indisponível mostra 'indisponível'", async ({ page }) => {
    await page.goto("/comercial/oportunidades");
    await expect(page.getByTestId("estado-api-indisponivel")).toContainText("indisponível", { ignoreCase: true });
    await expect(page.getByText("Dados de exemplo")).toHaveCount(0);
  });

  test("usuário sem papel vê 'acesso negado'", async ({ page }) => {
    await page.goto("/comercial/contratos");
    await expect(page.getByTestId("estado-api-proibido")).toContainText("acesso negado", { ignoreCase: true });
  });

  test("sessão inválida no recurso mostra convite para entrar", async ({ page }) => {
    await page.goto("/clientes");
    await expect(page.getByTestId("estado-api-naoAutenticado")).toBeVisible();
    await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
  });

  test("registro inexistente mostra 'não encontrado'", async ({ page }) => {
    await page.goto(`/comercial/contratos/${UUID_INEXISTENTE}`);
    await expect(page.getByTestId("estado-api-naoEncontrado")).toContainText("não encontrado", { ignoreCase: true });
  });
});
