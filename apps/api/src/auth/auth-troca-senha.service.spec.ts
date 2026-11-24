import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { hashToken } from "../core/auth/token.util";
import { AuthService } from "./auth.service";

const PRINCIPAL = { id: "u1" } as never;
const SENHA_ATUAL = "senha atual bem longa";
const SENHA_NOVA = "senha nova bem longa também";

function montar(opcoes: { hash?: string | null; senhaConfere?: boolean } = {}) {
  const repositorio = {
    findPasswordHash: vi.fn(async () => (opcoes.hash === undefined ? "hash-atual" : opcoes.hash)),
    findUserById: vi.fn(async () => ({ id: "u1", email: "ana@plugga.local" })),
    changePassword: vi.fn(async () => undefined),
  };
  const senhas = { verify: vi.fn(async () => opcoes.senhaConfere ?? true), hash: vi.fn(async (s: string) => `hash(${s})`) };
  const sessoes = { invalidarCacheDe: vi.fn(async () => undefined) };
  const limitador = { penalizar: vi.fn(async () => undefined) };
  const auditoria = {
    appendEvent: vi.fn<(evento: { eventName: string; payload: unknown }) => Promise<void>>().mockResolvedValue(undefined),
  };
  const servico = new AuthService(repositorio as never, senhas as never, sessoes as never, limitador as never, {} as never, auditoria as never, {} as never);
  return { servico, repositorio, senhas, sessoes, limitador, auditoria };
}

describe("AuthService.changePassword", () => {
  it("troca a senha mantendo a sessão que pediu, limpa o cache e audita sem a senha", async () => {
    const { servico, repositorio, sessoes, auditoria } = montar();

    await servico.changePassword(PRINCIPAL, "token-da-sessao", { currentPassword: SENHA_ATUAL, newPassword: SENHA_NOVA }, { ip: "10.0.0.1" });

    expect(repositorio.changePassword).toHaveBeenCalledWith("u1", `hash(${SENHA_NOVA})`, hashToken("token-da-sessao"));
    expect(sessoes.invalidarCacheDe).toHaveBeenCalledWith("u1");
    const evento = auditoria.appendEvent.mock.calls[0]?.[0];
    expect(evento?.eventName).toBe("auth.password.changed");
    expect(JSON.stringify(auditoria.appendEvent.mock.calls)).not.toContain(SENHA_NOVA);
    expect(JSON.stringify(auditoria.appendEvent.mock.calls)).not.toContain(SENHA_ATUAL);
  });

  it("conta sem senha (entra pelo Google) recebe aviso claro e nada é gravado", async () => {
    const { servico, repositorio } = montar({ hash: null });

    await expect(servico.changePassword(PRINCIPAL, "t", { currentPassword: "x", newPassword: SENHA_NOVA }, {})).rejects.toThrow(ConflictException);
    await expect(servico.changePassword(PRINCIPAL, "t", { currentPassword: "x", newPassword: SENHA_NOVA }, {})).rejects.toThrow(/Google/);
    expect(repositorio.changePassword).not.toHaveBeenCalled();
  });

  it("senha atual errada: recusa, penaliza no limite do login e não grava", async () => {
    const { servico, repositorio, limitador } = montar({ senhaConfere: false });

    await expect(servico.changePassword(PRINCIPAL, "t", { currentPassword: "errada", newPassword: SENHA_NOVA }, { ip: "10.0.0.9" })).rejects.toThrow(BadRequestException);

    expect(limitador.penalizar).toHaveBeenCalledWith("ana@plugga.local", "10.0.0.9");
    expect(repositorio.changePassword).not.toHaveBeenCalled();
  });

  it("senha nova igual à atual é recusada antes de gravar", async () => {
    const { servico, repositorio, senhas } = montar();

    await expect(servico.changePassword(PRINCIPAL, "t", { currentPassword: SENHA_ATUAL, newPassword: SENHA_ATUAL }, {})).rejects.toThrow(/diferente da atual/);

    expect(senhas.hash).not.toHaveBeenCalled();
    expect(repositorio.changePassword).not.toHaveBeenCalled();
  });

  it("sem o token da sessão no cookie, não troca nada", async () => {
    const { servico, repositorio } = montar();

    await expect(servico.changePassword(PRINCIPAL, undefined, { currentPassword: SENHA_ATUAL, newPassword: SENHA_NOVA }, {})).rejects.toThrow(UnauthorizedException);
    expect(repositorio.changePassword).not.toHaveBeenCalled();
  });
});
