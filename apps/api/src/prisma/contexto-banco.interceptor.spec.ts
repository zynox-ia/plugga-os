import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { defer, lastValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import type { AuthenticatedRequest } from "../core/auth/auth.types";
import { ContextoBancoInterceptor } from "../core/auth/contexto-banco.interceptor";
import { SessionAuthContext } from "../core/auth/session-auth-context";
import type { SessionLookupRepository } from "../core/auth/session-lookup.repository";
import { hashToken, SESSION_COOKIE_NAME } from "../core/auth/token.util";
import { contextoBanco } from "./contexto-banco";

const principal = { id: "pessoa-sintetica", kind: "user" as const, acesso: { plataforma: null, departamentos: [] } };
const contextoHttp = (request: AuthenticatedRequest) => ({
  switchToHttp: () => ({ getRequest: () => request }),
}) as ExecutionContext;

describe("contexto autenticado de banco", () => {
  it("só publica a capacidade após validar o cookie assinado, fora do principal", async () => {
    const sessions = { resolvePrincipal: async () => principal } as unknown as SessionLookupRepository;
    const request: AuthenticatedRequest = { headers: {}, signedCookies: { [SESSION_COOKIE_NAME]: "token-sintetico" } };
    expect(await new SessionAuthContext(sessions).resolve(request)).toBe(principal);
    expect(request.databaseSessionHash === hashToken("token-sintetico")).toBe(true);
    expect(principal).not.toHaveProperty("databaseSessionHash");
  });

  it("remove capacidade anterior quando o cookie não autentica e ignora headers", async () => {
    const sessions = { resolvePrincipal: async () => null } as unknown as SessionLookupRepository;
    const request: AuthenticatedRequest = {
      headers: { "x-session-hash": "forjado" }, databaseSessionHash: "anterior",
      signedCookies: { [SESSION_COOKIE_NAME]: "revogado" },
    };
    expect(await new SessionAuthContext(sessions).resolve(request)).toBeNull();
    expect(request.databaseSessionHash).toBeUndefined();
  });

  it("cria a subscription dentro do ALS e isola requisições concorrentes", async () => {
    const interceptor = new ContextoBancoInterceptor();
    const handler: CallHandler = {
      handle: () => defer(async () => {
        await Promise.resolve();
        return contextoBanco.getStore()?.sessionHash;
      }),
    };
    const executar = (sessionHash: string) => lastValueFrom(interceptor.intercept(contextoHttp({
      headers: {}, authPrincipal: principal, databaseSessionHash: sessionHash,
    }), handler));
    expect(await Promise.all([executar("a"), executar("b")])).toEqual(["a", "b"]);
    expect(contextoBanco.getStore()).toBeUndefined();
  });

  it("não aceita capacidade sem principal autenticado nem a extrai de headers", async () => {
    const observable = new ContextoBancoInterceptor().intercept(contextoHttp({
      headers: { "x-session-hash": "forjado" }, databaseSessionHash: "sem-principal",
    }), { handle: () => defer(async () => contextoBanco.getStore()?.sessionHash) });
    expect(await lastValueFrom(observable)).toBeUndefined();
  });
});
