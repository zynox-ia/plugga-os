import { expect, request as criarContexto } from "@playwright/test";

/**
 * Trava dos e2e que convidam ou removem pessoas: o envio de e-mail tem de estar
 * no adaptador "noop", para nenhum convite sair de verdade.
 *
 * Desde o 5fe0426, `GET /email/status` da API exige a plataforma
 * "desenvolvedor", e o admin da suíte recebe 403. A consulta entra com a conta
 * de desenvolvimento do seed (SEED_SAMPLE_TEAM, a mesma senha local do admin,
 * como na CI); E2E_DEV_EMAIL e E2E_DEV_PASSWORD trocam a conta.
 */
export async function confirmarEmailDesligado(baseURL: string, apiURL: string, ip: string): Promise<void> {
  const email = process.env.E2E_DEV_EMAIL ?? "desenvolvimento@plugga.local";
  const password = process.env.E2E_DEV_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? "local_only_change_me";
  const origin = new URL(baseURL).origin;
  const contexto = await criarContexto.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": ip } });
  try {
    const login = await contexto.post("/api/auth/login", { headers: { origin }, data: { email, password } });
    expect(login.ok(), `login de ${email} para consultar o e-mail (precisa de SEED_SAMPLE_TEAM=true)`).toBe(true);
    const status = await contexto.get(`${apiURL}/email/status`);
    expect(status.ok(), await status.text()).toBe(true);
    expect(await status.json()).toMatchObject({ provider: "noop" });
  } finally {
    await contexto.dispose();
  }
}
