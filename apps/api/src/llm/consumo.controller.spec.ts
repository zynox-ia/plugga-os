import { Reflector } from "@nestjs/core";
import type { Acesso } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { atendeExigencia, exigenciaDeAcesso } from "../core/auth/acesso.decorator";
import { ConsumoController } from "./consumo.controller";

describe("autorização da rota real de consumo", () => {
  const exigencia = exigenciaDeAcesso(new Reflector(), ConsumoController.prototype.resumo, ConsumoController);

  it("revogar todas as telas recusa o gerente financeiro", () => {
    const acesso: Acesso = { plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "gerente", telas: ["financeiro.receber"] }] };
    expect(atendeExigencia(acesso, exigencia)).toBe(true);
    acesso.departamentos[0]!.telas = [];
    expect(atendeExigencia(acesso, exigencia)).toBe(false);
  });

  it("não libera consumo a membro nem combina gerência de outro departamento", () => {
    const acesso: Acesso = { plataforma: null, departamentos: [
      { departamento: "financeiro", nivel: "membro", telas: ["financeiro.receber"] },
      { departamento: "crm", nivel: "gerente", telas: ["crm.clientes"] },
    ] };
    expect(atendeExigencia(acesso, exigencia)).toBe(false);
  });

  it("plataforma continua alcançando a gestão financeira", () => {
    for (const plataforma of ["admin", "desenvolvedor"] as const) {
      expect(atendeExigencia({ plataforma, departamentos: [] }, exigencia)).toBe(true);
    }
  });
});
