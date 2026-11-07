import { describe, expect, it } from "vitest";
import { AcessoNegado } from "../../common/errors/dominio";
import type { AuthPrincipal } from "./auth.types";
import { exigeAcessoATela, exigeAtribuicaoPermitida, gerenciaRegistros } from "./escopo-registros";

const membro: AuthPrincipal = { id: "membro-a", kind: "user", acesso: {
  plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }],
} };
const gerente: AuthPrincipal = { ...membro, acesso: { plataforma: null, departamentos: [
  { departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] },
] } };

describe("conteúdo por tela e atribuição pela gestão", () => {
  it("Membro alcança a tela concedida, sem herdar uma tela relacionada", () => {
    expect(() => exigeAcessoATela(membro, "crm.pipelines")).not.toThrow();
    expect(() => exigeAcessoATela(membro, "crm.clientes")).toThrow(AcessoNegado);
    expect(() => exigeAcessoATela(membro, "crm.contratos")).toThrow(AcessoNegado);
  });

  it("membro não atribui a outra pessoa nem remove o responsável", () => {
    expect(() => exigeAtribuicaoPermitida(membro, membro.id, "crm")).not.toThrow();
    for (const ownerId of ["membro-b", null, undefined]) {
      expect(() => exigeAtribuicaoPermitida(membro, ownerId, "crm")).toThrow(AcessoNegado);
    }
  });

  it("gerente não ganha gestão de outros departamentos", () => {
    expect(gerenciaRegistros(gerente, "crm")).toBe(true);
    expect(() => exigeAtribuicaoPermitida(gerente, "membro-b", "crm")).not.toThrow();
    expect(gerenciaRegistros(gerente, "energia-opm")).toBe(false);
  });

  it("admin e desenvolvedor herdam gestão sem depender do responsável", () => {
    for (const plataforma of ["admin", "desenvolvedor"] as const) {
      const principal: AuthPrincipal = { ...membro, acesso: { plataforma, departamentos: [] } };
      expect(gerenciaRegistros(principal, "crm")).toBe(true);
      expect(() => exigeAcessoATela(principal, "crm.clientes")).not.toThrow();
      expect(() => exigeAtribuicaoPermitida(principal, "membro-b", "crm")).not.toThrow();
    }
  });

  it("não combina gerência sem a tela com acesso de membro em outro departamento", () => {
    const misto: AuthPrincipal = { ...membro, acesso: { plataforma: null, departamentos: [
      { departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] },
      { departamento: "financeiro", nivel: "membro", telas: ["financeiro.pagar"] },
    ] } };
    expect(gerenciaRegistros(misto, ["crm", "financeiro"], ["crm.contratos", "financeiro.pagar"]))
      .toBe(false);
    expect(() => exigeAcessoATela(misto, "financeiro.pagar")).not.toThrow();
    const revogado: AuthPrincipal = { ...gerente, acesso: { plataforma: null, departamentos: [
      { departamento: "crm", nivel: "gerente", telas: [] },
    ] } };
    expect(gerenciaRegistros(revogado, "crm")).toBe(false);
    expect(() => exigeAcessoATela(revogado, "crm.pipelines")).toThrow(AcessoNegado);
  });
});
