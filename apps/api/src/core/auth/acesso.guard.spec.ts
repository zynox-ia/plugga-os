import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Acesso } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { acessoDeclarado } from "./access.decorators";
import { Departamento, Plataforma, Tela } from "./acesso.decorator";
import type { AuthPrincipal } from "./auth.types";
import { AcessoGuard } from "./acesso.guard";

class Controlador {
  @Departamento("crm")
  @Tela("crm.clientes")
  clientes(): void {}

  @Departamento("crm")
  operarCrm(): void {}

  @Departamento("suprimentos", "gerente")
  aprovarCompra(): void {}

  @Departamento(["financeiro", "suprimentos"])
  verFinanceiroOuSuprimentos(): void {}

  @Plataforma("admin")
  configurar(): void {}

  @Plataforma("desenvolvedor")
  verLogs(): void {}
}

@Departamento("energia-opm")
class ControladorDeEnergia {
  lerCiclos(): void {}

  @Departamento("financeiro", "gerente")
  aprovarRelatorio(): void {}
}

const MEMBRO_CRM: Acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro" }] };
const GERENTE_SUPRIMENTOS: Acesso = {
  plataforma: null,
  departamentos: [{ departamento: "suprimentos", nivel: "gerente" }],
};
const ADMIN: Acesso = { plataforma: "admin", departamentos: [] };
const DESENVOLVEDOR: Acesso = { plataforma: "desenvolvedor", departamentos: [] };

function contexto(
  classe: new () => object,
  metodo: string,
  principal: Partial<AuthPrincipal> | undefined,
): ExecutionContext {
  const handler = (classe.prototype as Record<string, () => void>)[metodo];
  const authPrincipal = principal ? { id: "u", kind: "user", ...principal } : undefined;
  return {
    getHandler: () => handler,
    getClass: () => classe,
    switchToHttp: () => ({ getRequest: () => ({ authPrincipal }) }),
  } as unknown as ExecutionContext;
}

const guard = new AcessoGuard(new Reflector());

function passa(classe: new () => object, metodo: string, principal: Partial<AuthPrincipal> | undefined): boolean {
  try {
    return guard.canActivate(contexto(classe, metodo, principal));
  } catch (erro) {
    if (erro instanceof ForbiddenException) return false;
    throw erro;
  }
}

describe("AcessoGuard com @Departamento e @Plataforma", () => {
  it("tela negada é recusada mesmo para diretor", () => {
    const acesso: Acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] }] };
    expect(passa(Controlador, "clientes", { acesso })).toBe(false);
    acesso.departamentos[0]!.telas = ["crm.clientes"];
    expect(passa(Controlador, "clientes", { acesso })).toBe(true);
    expect(passa(Controlador, "clientes", { acesso: ADMIN })).toBe(true);
  });
  it("membro opera o próprio departamento e não entra nos outros", () => {
    expect(passa(Controlador, "operarCrm", { acesso: MEMBRO_CRM })).toBe(true);
    expect(passa(Controlador, "aprovarCompra", { acesso: MEMBRO_CRM })).toBe(false);
  });

  it("aprovar exige gerente do departamento", () => {
    expect(passa(Controlador, "aprovarCompra", { acesso: GERENTE_SUPRIMENTOS })).toBe(true);
    expect(
      passa(Controlador, "aprovarCompra", {
        acesso: { plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro" }] },
      }),
    ).toBe(false);
  });

  it("lista de departamentos aceita qualquer um deles", () => {
    expect(passa(Controlador, "verFinanceiroOuSuprimentos", { acesso: GERENTE_SUPRIMENTOS })).toBe(true);
    expect(passa(Controlador, "verFinanceiroOuSuprimentos", { acesso: MEMBRO_CRM })).toBe(false);
  });

  it("admin e desenvolvedor passam em qualquer departamento, inclusive para aprovar", () => {
    expect(passa(Controlador, "aprovarCompra", { acesso: ADMIN })).toBe(true);
    expect(passa(Controlador, "aprovarCompra", { acesso: DESENVOLVEDOR })).toBe(true);
  });

  it("@Plataforma('admin') aceita admin e desenvolvedor, e recusa a equipe", () => {
    expect(passa(Controlador, "configurar", { acesso: ADMIN })).toBe(true);
    expect(passa(Controlador, "configurar", { acesso: DESENVOLVEDOR })).toBe(true);
    expect(passa(Controlador, "configurar", { acesso: GERENTE_SUPRIMENTOS })).toBe(false);
  });

  it("@Plataforma('desenvolvedor') recusa o admin", () => {
    expect(passa(Controlador, "verLogs", { acesso: DESENVOLVEDOR })).toBe(true);
    expect(passa(Controlador, "verLogs", { acesso: ADMIN })).toBe(false);
  });

  it("sem acesso no principal (serviço) recusa", () => {
    expect(passa(Controlador, "operarCrm", { kind: "service" })).toBe(false);
    expect(passa(Controlador, "operarCrm", undefined)).toBe(false);
  });

  it("a declaração da classe vale para os métodos, e a do método prevalece", () => {
    const membroEnergia: Acesso = {
      plataforma: null,
      departamentos: [{ departamento: "energia-opm", nivel: "membro" }],
    };
    expect(passa(ControladorDeEnergia, "lerCiclos", { acesso: membroEnergia })).toBe(true);
    expect(passa(ControladorDeEnergia, "aprovarRelatorio", { acesso: membroEnergia })).toBe(false);
    expect(
      passa(ControladorDeEnergia, "aprovarRelatorio", {
        acesso: { plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "gerente" }] },
      }),
    ).toBe(true);
  });
});

describe("acessoDeclarado com o modelo de 4 papéis", () => {
  const reflector = new Reflector();
  const declarado = (classe: new () => object, metodo: string) =>
    acessoDeclarado(
      reflector,
      (classe.prototype as Record<string, () => void>)[metodo] as never,
      classe as never,
    );

  it("conta como declaração e descreve a exigência para o inventário", () => {
    expect(declarado(Controlador, "aprovarCompra")).toEqual({
      acesso: "acesso",
      papeis: ["departamento:suprimentos:gerente"],
    });
    expect(declarado(Controlador, "verLogs")).toEqual({ acesso: "acesso", papeis: ["plataforma:desenvolvedor"] });
  });
});
