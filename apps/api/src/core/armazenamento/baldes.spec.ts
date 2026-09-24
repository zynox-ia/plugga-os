import { companyKeys, departmentIdsByCompany } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { BALDES_DE_SISTEMA, baldeDe, baldesDeNegocio } from "./baldes.js";

/**
 * O balde é função de (empresa, departamento), os mesmos identificadores dos
 * acessos por departamento. Assim o armazenamento segue o desenho de telas em
 * vez de inventar uma segunda organização que precisaria ser mantida junto.
 */
describe("baldeDe", () => {
  it.each([
    ["plugga", "comercial-clientes", "plugga-comercial-clientes"],
    ["plugga", "energia-opm", "plugga-energia-opm"],
    ["plugga", "produto-tecnologia", "plugga-produto-tecnologia"],
    ["plugga", "financeiro", "plugga-financeiro"],
    ["waze", "comercial-obras", "waze-comercial-obras"],
    ["waze", "engenharia-obras", "waze-engenharia-obras"],
    ["waze", "financeiro", "waze-financeiro"],
  ] as const)("%s + %s -> %s", (empresa, departamento, esperado) => {
    expect(baldeDe(empresa, departamento)).toBe(esperado);
  });

  it("financeiro existe nas duas empresas e cada uma tem o seu balde", () => {
    expect(baldeDe("plugga", "financeiro")).not.toBe(baldeDe("waze", "financeiro"));
  });

  it("recusa departamento que a empresa não tem", () => {
    // energia-opm é da Plugga; engenharia-obras é da Waze.
    expect(() => baldeDe("waze", "energia-opm")).toThrow(/waze.*energia-opm/);
    expect(() => baldeDe("plugga", "engenharia-obras")).toThrow(/plugga.*engenharia-obras/);
  });

  it("recusa departamento inventado, inclusive o que tenta escapar do balde", () => {
    expect(() => baldeDe("plugga", "financeiro/../waze-financeiro")).toThrow();
    expect(() => baldeDe("plugga", "")).toThrow();
    expect(() => baldeDe("plugga", "FINANCEIRO")).toThrow();
  });

  it("recusa empresa desconhecida", () => {
    expect(() => baldeDe("outra" as never, "financeiro")).toThrow();
  });
});

describe("baldesDeNegocio", () => {
  it("tem um balde para cada par empresa/departamento do cadastro, sem sobrar nem faltar", () => {
    const esperados = companyKeys.flatMap((empresa) =>
      departmentIdsByCompany[empresa].map((departamento) => `${empresa}-${departamento}`),
    );

    expect([...baldesDeNegocio()].sort()).toEqual([...esperados].sort());
    expect(baldesDeNegocio()).toHaveLength(7);
  });

  it("todo nome é válido para o S3: minúsculas, dígitos e hífen, de 3 a 63 caracteres", () => {
    for (const balde of [...baldesDeNegocio(), ...Object.values(BALDES_DE_SISTEMA)]) {
      expect(balde).toMatch(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/);
      expect(balde).not.toMatch(/--/);
    }
  });

  it("os baldes de sistema não se confundem com os de negócio", () => {
    for (const balde of Object.values(BALDES_DE_SISTEMA)) {
      expect(baldesDeNegocio()).not.toContain(balde);
    }
  });
});
