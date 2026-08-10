import { expect, test } from "@playwright/test";

import { bloquearTerceiros } from "./support/sem-terceiros";

// Exercises invite-accept and password-reset end to end (API -> Mailpit ->
// browser), so it opts out of the project's default authenticated storage
// state, same as auth.spec.ts. It also gets its own synthetic X-Forwarded-For
// (browser requests below, plus the FORWARDED_FOR header on this file's direct
// fetch() calls, which bypass the browser context entirely): every real
// /auth/login call in the suite runs from this one machine, and without a
// distinguishing IP they'd all share the 10-req/60s login throttle bucket and
// 429 each other (see apps/api/src/main.ts's loopback trust +
// apps/web/app/lib/auth-proxy.ts).
const FORWARDED_FOR = "203.0.113.203";
test.use({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { "x-forwarded-for": FORWARDED_FOR } });

/** Matches apps/api/prisma/seed.ts + .env.example / CI job env — local dev only. */
const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@plugga.local";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "local_only_change_me";

const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:3001";
const mailpitBaseUrl = process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:8025";

async function loginAsAdmin(): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": FORWARDED_FOR },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  if (!response.ok) {
    throw new Error(`admin login failed: ${response.status}`);
  }
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) {
    throw new Error("admin login did not set a session cookie");
  }
  const [cookiePair] = setCookie.split(";");
  if (!cookiePair) {
    throw new Error("admin login returned an empty session cookie");
  }
  return cookiePair;
}

async function inviteUser(sessionCookie: string, email: string, name: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/auth/invite`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: sessionCookie, "x-forwarded-for": FORWARDED_FOR },
    // Acesso mínimo válido: uma empresa, um papel, um departamento. O contrato
    // recusa convite sem alcance nenhum, e é isso que a tela também impede.
    body: JSON.stringify({
      email,
      name,
      access: {
        platformRoles: [],
        companies: [
          {
            companyId: "plugga",
            roles: ["viewer"],
            departments: [{ departmentId: "financeiro", isManager: false }],
          },
        ],
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`invite failed: ${response.status} ${await response.text()}`);
  }
}

async function requestReset(email: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/auth/reset/request`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": FORWARDED_FOR },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    throw new Error(`reset request failed: ${response.status}`);
  }
}

/** Polls Mailpit for the most recent message to `to` whose subject contains `subjectContains`. */
async function findTokenInEmail(to: string, subjectContains: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const listResponse = await fetch(`${mailpitBaseUrl}/api/v1/messages`);
    const list = (await listResponse.json()) as {
      messages: Array<{ ID: string; To: Array<{ Address: string }>; Subject: string; Created: string }>;
    };
    const match = list.messages
      .filter((m) => m.To.some((t) => t.Address === to) && m.Subject.includes(subjectContains))
      .sort((a, b) => new Date(b.Created).getTime() - new Date(a.Created).getTime())[0];

    if (match) {
      const detailResponse = await fetch(`${mailpitBaseUrl}/api/v1/message/${match.ID}`);
      const detail = (await detailResponse.json()) as { Text?: string; HTML?: string };
      const body = `${detail.Text ?? ""}${detail.HTML ?? ""}`;
      const tokenMatch = body.match(/token=([A-Za-z0-9_-]+)/);
      const token = tokenMatch?.[1];
      if (token) {
        return token;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`no email with token found for ${to} (subject contains "${subjectContains}")`);
}

test.describe("Auth — invite accept and password reset", () => {
  test.beforeEach(async ({ page }) => {
    await bloquearTerceiros(page);
  });

  test("accepting an invite with a valid token activates the account and logs the user in", async ({
    page,
  }) => {
    const email = `e2e.invite.${Date.now()}@plugga.local`;
    const sessionCookie = await loginAsAdmin();
    await inviteUser(sessionCookie, email, "E2E Invite Smoke");
    const token = await findTokenInEmail(email, "Convite");

    await page.goto(`/auth/accept-invite?token=${token}`);
    await page.getByLabel("Nova senha").fill("a-perfectly-fine-password-1");
    await page.getByLabel("Confirmar senha").fill("a-perfectly-fine-password-1");
    await page.getByRole("button", { name: "Definir senha e continuar" }).click();

    await expect(page.locator(".auth-success")).toHaveText("Senha definida com sucesso. Você já pode entrar.");

    await page.goto("/login");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill("a-perfectly-fine-password-1");
    await page.getByRole("button", { name: "Fazer login" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.locator(".app-shell")).toBeVisible();
  });

  test("reusing an already-consumed invite token is rejected", async ({ page }) => {
    const email = `e2e.invite.reuse.${Date.now()}@plugga.local`;
    const sessionCookie = await loginAsAdmin();
    await inviteUser(sessionCookie, email, "E2E Invite Reuse Smoke");
    const token = await findTokenInEmail(email, "Convite");

    // Consume it once via the API directly (equivalent to the happy-path UI flow).
    const firstAccept = await fetch(`${apiBaseUrl}/auth/accept-invite`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": FORWARDED_FOR },
      body: JSON.stringify({ token, password: "a-perfectly-fine-password-1" }),
    });
    expect(firstAccept.ok).toBe(true);

    // Second attempt with the same token must fail — exercised through the real UI.
    await page.goto(`/auth/accept-invite?token=${token}`);
    await page.getByLabel("Nova senha").fill("another-fine-password-2");
    await page.getByLabel("Confirmar senha").fill("another-fine-password-2");
    await page.getByRole("button", { name: "Definir senha e continuar" }).click();

    await expect(page.locator(".auth-error")).toHaveText(
      "Link inválido ou expirado. Peça um novo convite ao administrador.",
    );
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

  test("requesting and confirming a reset lets the user log in with the new password", async ({
    page,
  }) => {
    const email = `e2e.reset.${Date.now()}@plugga.local`;
    const sessionCookie = await loginAsAdmin();
    await inviteUser(sessionCookie, email, "E2E Reset Smoke");
    const inviteToken = await findTokenInEmail(email, "Convite");
    const activate = await fetch(`${apiBaseUrl}/auth/accept-invite`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": FORWARDED_FOR },
      body: JSON.stringify({ token: inviteToken, password: "original-password-0" }),
    });
    expect(activate.ok).toBe(true);

    await requestReset(email);
    const resetToken = await findTokenInEmail(email, "Redefinição");

    await page.goto(`/auth/reset?token=${resetToken}`);
    await page.getByLabel("Nova senha").fill("brand-new-password-3");
    await page.getByLabel("Confirmar senha").fill("brand-new-password-3");
    await page.getByRole("button", { name: "Redefinir senha" }).click();

    await expect(page.locator(".auth-success")).toHaveText("Senha redefinida com sucesso. Você já pode entrar.");

    await page.goto("/login");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill("brand-new-password-3");
    await page.getByRole("button", { name: "Fazer login" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.locator(".app-shell")).toBeVisible();
  });

  test("an invalid reset token shows a generic error", async ({ page }) => {
    await page.goto("/auth/reset?token=not-a-real-reset-token-000000000000");
    await page.getByLabel("Nova senha").fill("a-perfectly-fine-password-1");
    await page.getByLabel("Confirmar senha").fill("a-perfectly-fine-password-1");
    await page.getByRole("button", { name: "Redefinir senha" }).click();

    await expect(page.locator(".auth-error")).toHaveText("Link inválido ou expirado. Peça uma nova redefinição.");
  });
});
