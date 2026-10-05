import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import { Authenticated, Public } from "./access.decorators";
import { Roles } from "./roles.decorator";
import { RolesGuard } from "./roles.guard";

class Controlador {
  @Roles("admin")
  comPapel(): void {}

  @Public()
  publica(): void {}

  @Authenticated()
  logado(): void {}

  semDeclaracao(): void {}
}

function contexto(metodo: keyof Controlador, roles: string[] = []): ExecutionContext {
  const handler = Controlador.prototype[metodo] as () => void;
  return {
    getHandler: () => handler,
    getClass: () => Controlador,
    switchToHttp: () => ({ getRequest: () => ({ authPrincipal: { id: "u", kind: "user", roles } }) }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  const guard = new RolesGuard(new Reflector());

  it("nega rota sem @Public, @Authenticated, @Permissions nem @Roles (fail-closed)", () => {
    expect(() => guard.canActivate(contexto("semDeclaracao"))).toThrow(ForbiddenException);
  });

  it("deixa passar a rota que declara @Public ou @Authenticated", () => {
    expect(guard.canActivate(contexto("publica"))).toBe(true);
    expect(guard.canActivate(contexto("logado"))).toBe(true);
  });

  it("com @Roles exige um dos papéis", () => {
    expect(guard.canActivate(contexto("comPapel", ["admin"]))).toBe(true);
    expect(() => guard.canActivate(contexto("comPapel", ["tech"]))).toThrow(ForbiddenException);
  });
});
