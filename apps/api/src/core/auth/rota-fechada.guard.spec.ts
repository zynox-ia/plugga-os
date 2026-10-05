import { Controller, ForbiddenException, Get, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { Authenticated, Public } from "./access.decorators";
import { Permissions } from "./permissions.decorator";
import { Roles } from "./roles.decorator";
import { RotaFechadaGuard } from "./rota-fechada.guard";

@Controller("teste")
class ControladorDeTeste {
  @Get("sem") semDeclaracao(): void {}
  @Get("publica") @Public() publica(): void {}
  @Get("logado") @Authenticated() logado(): void {}
  @Get("papel") @Roles("admin") comPapel(): void {}
  @Get("permissao") @Permissions("integrations:read" as never) comPermissao(): void {}
  @Get("papel-vazio") @Roles() papelVazio(): void {}
}

@Controller("classe")
@Public()
class ControladorPublico {
  @Get() qualquer(): void {}
}

function contexto(classe: new () => object, metodo: string, tipo = "http"): ExecutionContext {
  const handler = (classe.prototype as Record<string, () => void>)[metodo]!;
  return { getType: () => tipo, getHandler: () => handler, getClass: () => classe } as unknown as ExecutionContext;
}

function guard(modo?: string) {
  const config = { get: (_k: string, padrao: unknown) => modo ?? padrao };
  return new RotaFechadaGuard(new Reflector(), config as never);
}

describe("RotaFechadaGuard", () => {
  it.each(["publica", "logado", "comPapel", "comPermissao"])("rota que declara o acesso (%s) passa em qualquer modo", (metodo) => {
    expect(guard("enforce").canActivate(contexto(ControladorDeTeste, metodo))).toBe(true);
    expect(guard("warn").canActivate(contexto(ControladorDeTeste, metodo))).toBe(true);
  });

  it("o marcador na classe vale para todas as rotas dela", () => {
    expect(guard("enforce").canActivate(contexto(ControladorPublico, "qualquer"))).toBe(true);
  });

  it("modo padrão é warn: rota sem declaração passa e é registrada uma vez só", () => {
    const g = guard();
    const aviso = vi.spyOn((g as unknown as { logger: { warn: (m: string) => void } }).logger, "warn").mockImplementation(() => {});

    expect(g.canActivate(contexto(ControladorDeTeste, "semDeclaracao"))).toBe(true);
    expect(g.canActivate(contexto(ControladorDeTeste, "semDeclaracao"))).toBe(true);

    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso.mock.calls[0]![0]).toContain("ControladorDeTeste.semDeclaracao");
  });

  it("modo enforce nega rota sem declaração, inclusive @Roles() vazio", () => {
    expect(() => guard("enforce").canActivate(contexto(ControladorDeTeste, "semDeclaracao"))).toThrow(ForbiddenException);
    expect(() => guard("enforce").canActivate(contexto(ControladorDeTeste, "papelVazio"))).toThrow(ForbiddenException);
  });

  it("não interfere em contexto que não é HTTP", () => {
    expect(guard("enforce").canActivate(contexto(ControladorDeTeste, "semDeclaracao", "rpc"))).toBe(true);
  });
});
