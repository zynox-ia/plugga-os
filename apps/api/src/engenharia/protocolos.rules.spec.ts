import { agenciaVirtualUrlSchema, type Acesso } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { RequisicaoInvalida } from "../common/errors/dominio";
import { conferirDatas, departamentosDosProtocolosDe, diasEntre, gerenteDosProtocolos, idDaDistribuidora, prazoDoProtocolo, verificaHoje } from "./protocolos.rules";

const membro = (departamento: string, telas: string[], nivel: "membro" | "gerente" = "membro") => ({ plataforma: null, departamentos: [{ departamento, nivel, telas }] }) as unknown as Acesso;

describe("protocolos: acesso", () => {
  it("cada departamento pela própria tela de protocolos", () => {
    expect(departamentosDosProtocolosDe(membro("engenharia-obras", ["engenharia-obras.protocolos"]))).toEqual(["engenharia-obras"]);
    expect(departamentosDosProtocolosDe(membro("energia-opm", ["energia-opm.protocolos"]))).toEqual(["energia-opm"]);
    expect(departamentosDosProtocolosDe(membro("engenharia-obras", ["engenharia-obras.os"]))).toEqual([]);
    expect(departamentosDosProtocolosDe({ plataforma: "admin", departamentos: [] } as unknown as Acesso)).toEqual(["engenharia-obras", "energia-opm"]);
    expect(departamentosDosProtocolosDe(undefined)).toEqual([]);
  });

  it("o catálogo de distribuidoras é do gerente com a tela de protocolos", () => {
    expect(gerenteDosProtocolos(membro("energia-opm", ["energia-opm.protocolos"], "gerente"))).toBe(true);
    expect(gerenteDosProtocolos(membro("energia-opm", ["energia-opm.protocolos"]))).toBe(false);
    expect(gerenteDosProtocolos(membro("engenharia-obras", ["engenharia-obras.os"], "gerente"))).toBe(false);
    expect(gerenteDosProtocolos(membro("crm", ["crm.clientes"], "gerente"))).toBe(false);
  });
});

describe("protocolos: datas e prazos", () => {
  const hoje = "2026-11-23";

  it("dias até o limite, verificar hoje e o prazo", () => {
    expect(diasEntre(hoje, "2026-11-30")).toBe(7);
    expect(diasEntre(hoje, "2026-11-20")).toBe(-3);
    expect(diasEntre("2026-02-27", "2026-03-02")).toBe(3);
    expect(verificaHoje("em_analise", hoje, hoje)).toBe(true);
    expect(verificaHoje("aberto", "2026-11-20", hoje)).toBe(true);
    expect(verificaHoje("aberto", "2026-11-24", hoje)).toBe(false);
    expect(verificaHoje("liberado", null, hoje)).toBe(false);
    expect(prazoDoProtocolo("aberto", "2026-11-22", hoje)).toBe("vencido");
    expect(prazoDoProtocolo("aberto", "2026-11-30", hoje)).toBe("vence_em_7_dias");
    expect(prazoDoProtocolo("aberto", "2026-12-01", hoje)).toBe("no_prazo");
    expect(prazoDoProtocolo("indeferido", "2026-11-22", hoje)).toBe("encerrado");
  });

  it("sem datas no passado: data-limite e próxima verificação a partir de hoje; abertura até hoje", () => {
    expect(() => conferirDatas({ abertoEm: "2026-10-01", dataLimite: hoje, proximaVerificacao: hoje }, hoje)).not.toThrow();
    expect(() => conferirDatas({ dataLimite: "2026-11-22" }, hoje)).toThrow(RequisicaoInvalida);
    expect(() => conferirDatas({ proximaVerificacao: "2026-11-22" }, hoje)).toThrow(RequisicaoInvalida);
    expect(() => conferirDatas({ abertoEm: "2026-11-24" }, hoje)).toThrow(RequisicaoInvalida);
    expect(() => conferirDatas({ proximaVerificacao: null }, hoje)).not.toThrow();
  });

  it("id da distribuidora pelo nome", () => {
    expect(idDaDistribuidora("Amazonas Energia")).toBe("amazonas-energia");
    expect(idDaDistribuidora("  Equatorial Pará ")).toBe("equatorial-para");
  });
});

describe("protocolos: atalho da Agência Virtual", () => {
  it("só https, sem usuário, senha nem parâmetro de login", () => {
    expect(agenciaVirtualUrlSchema.safeParse("https://agencia.exemplo.com.br/servicos").success).toBe(true);
    expect(agenciaVirtualUrlSchema.safeParse("http://agencia.exemplo.com.br").success).toBe(false);
    expect(agenciaVirtualUrlSchema.safeParse("https://usuario:senha@agencia.exemplo.com.br").success).toBe(false);
    expect(agenciaVirtualUrlSchema.safeParse("https://agencia.exemplo.com.br/entrar?login=fulano").success).toBe(false);
    expect(agenciaVirtualUrlSchema.safeParse("https://agencia.exemplo.com.br/?senha=123").success).toBe(false);
    expect(agenciaVirtualUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
  });
});
