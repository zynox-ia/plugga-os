import { HttpException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import type { AuditRepository, EventAppend } from "../audit/audit.repository";
import type { AuthRepository, AuthUserRecord } from "./auth.repository";
import { GoogleAuthService } from "./google-auth.service";
import type { GoogleIdentityClaims, GoogleIdentityVerifier } from "./google-identity.verifier";
import type { SessionService } from "./session.service";

/**
 * Política de domínio do login Google (US11, T116): `hd` tem de bater com o
 * domínio do e-mail e, com `GOOGLE_ALLOWED_HD`, estar na lista permitida.
 * Dublês só nas bordas (repositório, verificador, sessão, auditoria): a decisão
 * é a do serviço de verdade.
 */

const CSRF = "csrf";

const usuario: AuthUserRecord = {
  id: "0b7c1d0e-6a53-4c1f-9d57-3f4b2a9e8c11",
  email: "ana@plugga.com.br",
  name: "Ana",
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  access: { platformRoles: [], companies: [] },
};

function montar(claims: GoogleIdentityClaims, allowedHd?: string) {
  const eventos: EventAppend[] = [];
  const repository = {
    findIdentityBySubject: vi.fn().mockResolvedValue(null),
    findUserByEmail: vi.fn().mockResolvedValue(usuario),
    findUserById: vi.fn().mockResolvedValue(usuario),
    linkIdentity: vi.fn().mockResolvedValue(usuario),
    recordIdentityLogin: vi.fn().mockResolvedValue(undefined),
  };
  const verifier = { verify: vi.fn().mockResolvedValue(claims) };
  const sessions = { issue: vi.fn().mockResolvedValue("token-bruto") };
  const audit = {
    appendEvent: vi.fn(async (evento: EventAppend) => {
      eventos.push(evento);
    }),
  };
  const config = {
    get: (chave: string, padrao?: unknown) => {
      if (chave === "GOOGLE_AUTH_ENABLED") return true;
      if (chave === "GOOGLE_ALLOWED_HD") return allowedHd ?? padrao;
      return padrao;
    },
  };
  const servico = new GoogleAuthService(
    repository as unknown as AuthRepository,
    verifier as unknown as GoogleIdentityVerifier,
    sessions as unknown as SessionService,
    audit as unknown as AuditRepository,
    config as unknown as ConfigService,
  );
  return { servico, repository, sessions, eventos };
}

async function tentar(servico: GoogleAuthService) {
  return servico.login({ credential: "x", csrfFromBody: CSRF, csrfFromCookie: CSRF }, {});
}

function razoes(eventos: EventAppend[]): unknown[] {
  return eventos.map((e) => (e.payload as { reason?: string }).reason);
}

const claimsPlugga: GoogleIdentityClaims = {
  subject: "sub-1",
  email: "ana@plugga.com.br",
  emailVerified: true,
  hostedDomain: "plugga.com.br",
};

describe("GoogleAuthService: domínio (hd)", () => {
  it("aceita hd igual ao domínio do e-mail quando não há lista", async () => {
    const { servico, sessions } = montar(claimsPlugga);
    await expect(tentar(servico)).resolves.toMatchObject({ token: "token-bruto" });
    expect(sessions.issue).toHaveBeenCalledOnce();
  });

  it("recusa hd diferente do domínio do e-mail, antes de consultar usuário ou vincular", async () => {
    const { servico, repository, sessions, eventos } = montar({ ...claimsPlugga, hostedDomain: "outra.com.br" });

    await expect(tentar(servico)).rejects.toBeInstanceOf(HttpException);
    expect(razoes(eventos)).toEqual(["hd_mismatch"]);
    expect(repository.findIdentityBySubject).not.toHaveBeenCalled();
    expect(repository.linkIdentity).not.toHaveBeenCalled();
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it("compara o domínio sem diferenciar maiúsculas", async () => {
    const { servico } = montar({ ...claimsPlugga, hostedDomain: "PLUGGA.com.br" });
    await expect(tentar(servico)).resolves.toMatchObject({ token: "token-bruto" });
  });

  it("com GOOGLE_ALLOWED_HD, aceita só domínio da lista", async () => {
    const dentro = montar(claimsPlugga, "waze.com.br, plugga.com.br");
    await expect(tentar(dentro.servico)).resolves.toMatchObject({ token: "token-bruto" });

    const fora = montar(
      { ...claimsPlugga, email: "bia@outra.com.br", hostedDomain: "outra.com.br" },
      "plugga.com.br",
    );
    await expect(tentar(fora.servico)).rejects.toBeInstanceOf(HttpException);
    expect(razoes(fora.eventos)).toEqual(["hd_not_allowed"]);
    expect(fora.sessions.issue).not.toHaveBeenCalled();
  });

  it("com GOOGLE_ALLOWED_HD, conta sem hd (Gmail comum) é recusada", async () => {
    const { servico, eventos, sessions } = montar(
      { subject: "sub-2", email: "pessoa@gmail.com", emailVerified: true, hostedDomain: null },
      "plugga.com.br",
    );
    await expect(tentar(servico)).rejects.toBeInstanceOf(HttpException);
    expect(razoes(eventos)).toEqual(["hd_not_allowed"]);
    expect(sessions.issue).not.toHaveBeenCalled();
  });

  it("sem GOOGLE_ALLOWED_HD, Gmail comum (sem hd) segue a política de antes e entra", async () => {
    const { servico } = montar({
      subject: "sub-2",
      email: "pessoa@gmail.com",
      emailVerified: true,
      hostedDomain: null,
    });
    await expect(tentar(servico)).resolves.toMatchObject({ token: "token-bruto" });
  });

  it("a lista vale também para quem já tem identidade vinculada", async () => {
    const { servico, repository, eventos } = montar(claimsPlugga, "waze.com.br");
    repository.findIdentityBySubject.mockResolvedValue({ id: "identity-1", userId: usuario.id });

    await expect(tentar(servico)).rejects.toBeInstanceOf(HttpException);
    expect(razoes(eventos)).toEqual(["hd_not_allowed"]);
    expect(repository.recordIdentityLogin).not.toHaveBeenCalled();
  });

  it("a resposta pública é a mesma de qualquer outra recusa (401 unauthorized)", async () => {
    const { servico } = montar({ ...claimsPlugga, hostedDomain: "outra.com.br" });
    const erro = (await tentar(servico).catch((e: unknown) => e)) as HttpException;
    expect(erro.getStatus()).toBe(401);
    expect(erro.getResponse()).toMatchObject({ code: "unauthorized" });
  });
});
