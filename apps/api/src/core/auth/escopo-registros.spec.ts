import { describe, expect, it } from "vitest";
import { AcessoNegado, NaoEncontrado } from "../../common/errors/dominio";
import type { AuthPrincipal } from "./auth.types";
import { exigeAtribuicaoPermitida, exigeRegistroVisivel, filtroDoResponsavel } from "./escopo-registros";

const membro: AuthPrincipal = { id: "membro-a", kind: "user", acesso: {
  plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }],
} };
const gerente: AuthPrincipal = { ...membro, acesso: { plataforma: null, departamentos: [
  { departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] },
] } };

describe("isolamento de registros por responsável", () => {
  it("membro lista somente os próprios registros e não identifica registro de outro responsável", () => {
    expect(filtroDoResponsavel(membro, "crm")).toEqual({ ownerId: membro.id });
    expect(() => exigeRegistroVisivel(membro, membro.id, "crm", "Registro não encontrado.")).not.toThrow();
    for (const ownerId of ["membro-b", null, undefined]) {
      expect(() => exigeRegistroVisivel(membro, ownerId, "crm", "Registro não encontrado.")).toThrow(NaoEncontrado);
    }
  });

  it("membro não atribui a outra pessoa nem remove o responsável", () => {
    expect(() => exigeAtribuicaoPermitida(membro, membro.id, "crm")).not.toThrow();
    for (const ownerId of ["membro-b", null, undefined]) {
      expect(() => exigeAtribuicaoPermitida(membro, ownerId, "crm")).toThrow(AcessoNegado);
    }
  });

  it("gerente alcança os registros do departamento sem ganhar gestão de outros departamentos", () => {
    expect(filtroDoResponsavel(gerente, "crm")).toEqual({});
    expect(() => exigeRegistroVisivel(gerente, "membro-b", "crm", "Registro não encontrado.")).not.toThrow();
    expect(() => exigeAtribuicaoPermitida(gerente, "membro-b", "crm")).not.toThrow();
    expect(filtroDoResponsavel(gerente, "energia-opm")).toEqual({ ownerId: gerente.id });
  });

  it("admin e desenvolvedor herdam gestão sem depender do responsável", () => {
    for (const plataforma of ["admin", "desenvolvedor"] as const) {
      const principal: AuthPrincipal = { ...membro, acesso: { plataforma, departamentos: [] } };
      expect(filtroDoResponsavel(principal, "crm")).toEqual({});
      expect(() => exigeRegistroVisivel(principal, null, "crm", "Registro não encontrado.")).not.toThrow();
    }
  });

  it("não combina gerência sem a tela com acesso de membro em outro departamento", () => {
    const misto: AuthPrincipal = { ...membro, acesso: { plataforma: null, departamentos: [
      { departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] },
      { departamento: "financeiro", nivel: "membro", telas: ["financeiro.pagar"] },
    ] } };
    expect(filtroDoResponsavel(misto, ["crm", "financeiro"], ["crm.contratos", "financeiro.pagar"]))
      .toEqual({ ownerId: misto.id });
    const revogado: AuthPrincipal = { ...gerente, acesso: { plataforma: null, departamentos: [
      { departamento: "crm", nivel: "gerente", telas: [] },
    ] } };
    expect(filtroDoResponsavel(revogado, "crm")).toEqual({ ownerId: revogado.id });
  });
});
