import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthPrincipal } from "./auth.types";
import { PermissionsGuard } from "./permissions.guard";

function contextoFalso(principal: AuthPrincipal | undefined): ExecutionContext {
  return {
    getHandler: () => (() => undefined) as unknown as ExecutionContext["getHandler"],
    getClass: () => class {} as unknown as ExecutionContext["getClass"],
    switchToHttp: () => ({
      getRequest: () => ({ authPrincipal: principal }),
    }),
  } as unknown as ExecutionContext & { __metadata: unknown[] };
}

describe("PermissionsGuard", () => {
  let reflector: Reflector;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PermissionsGuard(reflector);
  });

  function mockRequired(permissoes: string[] | undefined) {
    reflector.getAllAndOverride = (() => permissoes) as typeof reflector.getAllAndOverride;
  }

  it("passa quando a rota não exige nenhuma permissão", () => {
    mockRequired(undefined);
    expect(guard.canActivate(contextoFalso(undefined))).toBe(true);
  });

  it("passa quando algum papel do principal tem a permissão exigida", () => {
    mockRequired(["compra.aprovar"]);
    const principal: AuthPrincipal = { id: "u1", kind: "user", roles: ["financeiro"] };
    expect(guard.canActivate(contextoFalso(principal))).toBe(true);
  });

  it("recusa quando nenhum papel tem a permissão", () => {
    mockRequired(["compra.aprovar"]);
    const principal: AuthPrincipal = { id: "u1", kind: "user", roles: ["tecnico"] };
    expect(() => guard.canActivate(contextoFalso(principal))).toThrow(ForbiddenException);
  });

  it("recusa sem principal autenticado quando a rota exige permissão", () => {
    mockRequired(["relatorio.ver"]);
    expect(() => guard.canActivate(contextoFalso(undefined))).toThrow(ForbiddenException);
  });

  it("documento.excluir nunca é concedido — ninguém apaga evidência (POP-OBR-001 §5.1)", () => {
    mockRequired(["documento.excluir"]);
    const principal: AuthPrincipal = { id: "u1", kind: "user", roles: ["admin", "diretoria"] };
    expect(() => guard.canActivate(contextoFalso(principal))).toThrow(ForbiddenException);
  });
});
