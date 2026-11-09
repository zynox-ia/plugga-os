import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import type { ListaDaEquipe, SessionUser } from "@plugga/shared";

async function openMember(page: Page, request: APIRequestContext, role: "admin" | "desenvolvedor", self = false) {
  const meResponse = await request.get("/api/auth/me");
  expect(meResponse.status()).toBe(200);
  const me = await meResponse.json() as SessionUser;
  const teamResponse = await request.get("/api/equipe");
  expect(teamResponse.status()).toBe(200);
  const team = await teamResponse.json() as ListaDaEquipe;
  const target = team.membros.find((member) => member.tipo !== "agente_ia");
  expect(target).toBeTruthy();
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: {
    ...me, id: self ? target!.id : randomUUID(), acesso: { plataforma: role, departamentos: [] },
  } }));
  await page.goto("/configuracoes?aba=equipe");
  const row = page.getByRole("row").filter({ hasText: target!.email });
  await row.getByRole("button", { name: /Ver detalhes de/ }).click();
  return target!;
}

test("recuperação por Desenvolvedor exige solicitação, motivo e fator próprio antes de remover", async ({ page, request }) => {
  await page.route("**/api/auth/mfa/status", (route) => route.fulfill({ json: { enabled: true, recentlyVerified: false, recoveryCodesRemaining: 2 } }));
  let confirms = 0;
  let removals = 0;
  let targetId = "";
  const reason = "Solicitação da pessoa recebida após perda do autenticador e dos códigos.";
  await page.route("**/api/auth/mfa/confirm", async (route) => {
    confirms += 1;
    expect(route.request().postDataJSON()).toEqual({ code: "123456" });
    await route.fulfill({ status: confirms === 1 ? 401 : 200, json: { ok: confirms > 1 } });
  });
  await page.route("**/api/auth/mfa/users/*/remove", async (route) => {
    removals += 1;
    expect(route.request().url()).toContain(`/users/${targetId}/remove`);
    expect(route.request().postDataJSON()).toEqual({ reason });
    await route.fulfill({ json: { ok: true } });
  });
  targetId = (await openMember(page, request, "desenvolvedor")).id;
  const dialog = page.getByRole("dialog", { name: "Detalhes do Membro", exact: true });
  await dialog.getByRole("button", { name: "Remover 2FA desta pessoa" }).click();
  await expect(dialog.getByRole("button", { name: "Confirmar remoção e encerrar sessões" })).toBeDisabled();
  await dialog.getByLabel("Solicitação recebida e motivo da remoção").fill(reason);
  await dialog.getByLabel("Código de verificação ou recuperação").fill("123456");
  await dialog.getByRole("button", { name: "Confirmar remoção e encerrar sessões" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Código inválido");
  expect(removals).toBe(0);
  await dialog.getByLabel("Código de verificação ou recuperação").fill("123456");
  await dialog.getByRole("button", { name: "Confirmar remoção e encerrar sessões" }).click();
  await expect(dialog.getByText("Proteção removida", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Todas as sessões de .* foram encerradas/)).toBeVisible();
  expect(removals).toBe(1);
});

test("Desenvolvedor sem 2FA próprio recebe orientação de ativação, sem poder remover", async ({ page, request }) => {
  await page.route("**/api/auth/mfa/status", (route) => route.fulfill({ json: { enabled: false, recentlyVerified: false, recoveryCodesRemaining: 0 } }));
  await openMember(page, request, "desenvolvedor");
  const dialog = page.getByRole("dialog", { name: "Detalhes do Membro", exact: true });
  await dialog.getByRole("button", { name: "Remover 2FA desta pessoa" }).click();
  await expect(dialog.getByText("Ative sua própria proteção para continuar", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Confirmar remoção e encerrar sessões" })).toHaveCount(0);
});

for (const scenario of [{ role: "admin", self: false }, { role: "desenvolvedor", self: true }] as const) {
  test(`recuperação não aparece para ${scenario.self ? "a própria conta do Desenvolvedor" : "Admin"}`, async ({ page, request }) => {
    await openMember(page, request, scenario.role, scenario.self);
    await expect(page.getByRole("button", { name: "Remover 2FA desta pessoa" })).toHaveCount(0);
  });
}

test("recuperação não aparece para membro do tipo agente_ia", async ({ page, request }) => {
  const me = await (await request.get("/api/auth/me")).json() as SessionUser;
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: {
    ...me, acesso: { plataforma: "desenvolvedor", departamentos: [] },
  } }));
  const team: ListaDaEquipe = {
    membros: [{
      id: "00000000-0000-4000-8000-000000009999", email: "bot@plugga.test",
      name: "Agente IA Assistente", status: "active", tipo: "agente_ia",
      acesso: { plataforma: null, departamentos: [] }, createdAt: "2026-11-09T00:00:00.000Z",
      podeEditar: false, podeDesativar: false, podeRemover: false, podeReenviarConvite: false,
    }],
    escopo: { papel: "desenvolvedor", podeConvidar: true, papeisConcediveis: ["desenvolvedor", "admin", "gerente", "membro"], departamentos: [] },
  };
  await page.route("**/api/equipe", (route) => route.fulfill({ json: team }));
  // A lista inicial vem do servidor; o convite simulado causa a releitura
  // pelo navegador, sem criar contas nem enviar mensagens reais.
  await page.route("**/api/equipe/convites", (route) => route.fulfill({ json: { ok: true } }));
  await page.goto("/configuracoes?aba=equipe");
  await page.getByRole("button", { name: "Novo Membro", exact: true }).click();
  const invite = page.getByRole("dialog", { name: "Novo Membro", exact: true });
  await invite.getByRole("textbox", { name: /^Nome completo/ }).fill("Pessoa sintética");
  await invite.getByRole("textbox", { name: /^E-mail corporativo/ }).fill("pessoa@example.test");
  await invite.getByRole("button", { name: "Enviar convite", exact: true }).click();
  await expect(invite).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: "bot@plugga.test" });
  await row.getByRole("button", { name: /Ver detalhes de/ }).click();
  await expect(page.getByRole("dialog", { name: "Detalhes do Membro", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remover 2FA desta pessoa" })).toHaveCount(0);
});
