import type { Acesso } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { inicioDoDiaEmManaus } from "../compras/dias-uteis";
import {
  acoesPermitidas,
  codigoDoLancamento,
  condicaoDaSituacao,
  diasParaVencer,
  emCobranca,
  fimDoMesEmManaus,
  numeroDaBusca,
  papelNoFinanceiro,
  planejarAcao,
  podeEditar,
  podeExecutar,
  prazoDoLancamento,
  tiposVisiveis,
  type EstadoDoLancamento,
} from "./financeiro.rules";

// 23/11/2026 às 22h em Manaus (UTC-4) já é 24/11 em UTC: o dia que vale é o de Manaus.
const AGORA = new Date("2026-11-24T02:00:00.000Z");
const dia = (d: string) => inicioDoDiaEmManaus(d);

const acesso = (telas: string[], nivel: "membro" | "gerente" = "membro"): Acesso =>
  ({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel, telas }] }) as Acesso;

const MEMBRO_PAGAR = papelNoFinanceiro(acesso(["financeiro.pagar"]));
const MEMBRO_RECEBER = papelNoFinanceiro(acesso(["financeiro.receber"]));
const GERENTE = papelNoFinanceiro(acesso(["financeiro.pagar", "financeiro.receber"], "gerente"));
const ADMIN = papelNoFinanceiro({ plataforma: "admin", departamentos: [] } as Acesso);

const saida = (o: Partial<EstadoDoLancamento> = {}): EstadoDoLancamento => ({ tipo: "saida", etapa: "aberta", canceladoEm: null, vencimento: dia("2026-11-30"), ...o });
const entrada = (o: Partial<EstadoDoLancamento> = {}): EstadoDoLancamento => ({ tipo: "entrada", etapa: "gerada", canceladoEm: null, vencimento: dia("2026-11-30"), ...o });

describe("papel e alcance", () => {
  it("cada tela dá o seu tipo; gerente e plataforma aprovam", () => {
    expect(MEMBRO_PAGAR).toEqual({ saidas: true, entradas: false, gerente: false });
    expect(MEMBRO_RECEBER).toEqual({ saidas: false, entradas: true, gerente: false });
    expect(GERENTE.gerente).toBe(true);
    expect(ADMIN).toEqual({ saidas: true, entradas: true, gerente: true });
    expect(papelNoFinanceiro(undefined)).toEqual({ saidas: false, entradas: false, gerente: false });
  });

  it("os tipos visíveis cruzam o filtro com o alcance", () => {
    expect(tiposVisiveis(MEMBRO_PAGAR, "todos")).toEqual(["saida"]);
    expect(tiposVisiveis(MEMBRO_PAGAR, "entrada")).toEqual([]);
    expect(tiposVisiveis(ADMIN, "todos")).toEqual(["saida", "entrada"]);
  });
});

describe("datas em Manaus", () => {
  it("conta dias de calendário de Manaus, não de UTC", () => {
    expect(diasParaVencer(dia("2026-11-23"), AGORA)).toBe(0);
    expect(diasParaVencer(dia("2026-11-24"), AGORA)).toBe(1);
    expect(diasParaVencer(dia("2026-11-20"), AGORA)).toBe(-3);
  });

  it("prazo some no liquidado e no cancelado", () => {
    expect(prazoDoLancamento(saida({ vencimento: dia("2026-11-23") }), AGORA)).toEqual({ situacao: "vence_hoje", dias: 0 });
    expect(prazoDoLancamento(saida({ vencimento: dia("2026-11-21") }), AGORA)).toEqual({ situacao: "vencido", dias: -2 });
    expect(prazoDoLancamento(saida({ etapa: "paga" }), AGORA)).toBeNull();
    expect(prazoDoLancamento(saida({ canceladoEm: AGORA }), AGORA)).toBeNull();
  });

  it("em cobrança é a entrada enviada e vencida", () => {
    expect(emCobranca(entrada({ etapa: "enviada", vencimento: dia("2026-11-20") }), AGORA)).toBe(true);
    expect(emCobranca(entrada({ etapa: "enviada", vencimento: dia("2026-11-23") }), AGORA)).toBe(false);
    expect(emCobranca(entrada({ etapa: "boleto_gerado", vencimento: dia("2026-11-20") }), AGORA)).toBe(false);
    expect(emCobranca(saida({ etapa: "aprovada", vencimento: dia("2026-11-20") }), AGORA)).toBe(false);
  });

  it("fim do mês corrente de Manaus", () => {
    expect(fimDoMesEmManaus(AGORA)).toBe("2026-11-30");
    expect(fimDoMesEmManaus(new Date("2028-02-10T12:00:00Z"))).toBe("2028-02-29");
    // 31/12 às 22h em Manaus ainda é dezembro.
    expect(fimDoMesEmManaus(new Date("2027-01-01T02:00:00Z"))).toBe("2026-12-31");
  });
});

describe("código e busca", () => {
  it("CP e CR com quatro dígitos", () => {
    expect(codigoDoLancamento("saida", 412)).toBe("CP-0412");
    expect(codigoDoLancamento("entrada", 2081)).toBe("CR-2081");
  });

  it("a busca reconhece o código com ou sem prefixo", () => {
    expect(numeroDaBusca("CP-0412")).toEqual({ tipo: "saida", numero: 412 });
    expect(numeroDaBusca("cr 2081")).toEqual({ tipo: "entrada", numero: 2081 });
    expect(numeroDaBusca("412")).toEqual({ tipo: null, numero: 412 });
    expect(numeroDaBusca("Hotel")).toBeNull();
  });
});

describe("ações", () => {
  it("aprovar: só saída aberta, só gerente", () => {
    expect(planejarAcao(saida(), { acao: "aprovar" })).toEqual({ tipo: "aprovar", etapa: "aprovada" });
    expect(planejarAcao(saida({ etapa: "aprovada" }), { acao: "aprovar" })).toMatchObject({ codigo: "CONFLITO_ESTADO" });
    expect(planejarAcao(entrada(), { acao: "aprovar" })).toMatchObject({ codigo: "CONFLITO_ESTADO" });
    expect(podeExecutar(MEMBRO_PAGAR, saida(), "aprovar")).toBe(false);
    expect(podeExecutar(GERENTE, saida(), "aprovar")).toBe(true);
    expect(podeExecutar(ADMIN, saida(), "aprovar")).toBe(true);
  });

  it("cancelar: antes de liquidar, nunca o cancelado; a aprovada só pela gerente", () => {
    expect(planejarAcao(saida(), { acao: "cancelar", motivo: "Duplicada" })).toEqual({ tipo: "cancelar", motivo: "Duplicada" });
    expect(planejarAcao(saida({ etapa: "paga" }), { acao: "cancelar", motivo: "x" })).toMatchObject({ codigo: "CONFLITO_ESTADO" });
    expect(planejarAcao(saida({ canceladoEm: AGORA }), { acao: "cancelar", motivo: "x" })).toMatchObject({ codigo: "CONFLITO_ESTADO" });
    expect(podeExecutar(MEMBRO_PAGAR, saida(), "cancelar")).toBe(true);
    expect(podeExecutar(MEMBRO_PAGAR, saida({ etapa: "aprovada" }), "cancelar")).toBe(false);
    expect(podeExecutar(MEMBRO_RECEBER, entrada({ etapa: "enviada" }), "cancelar")).toBe(true);
  });

  it("fora do tipo, nenhuma ação", () => {
    expect(podeExecutar(MEMBRO_RECEBER, saida(), "cancelar")).toBe(false);
    expect(acoesPermitidas(saida(), MEMBRO_RECEBER)).toEqual([]);
  });

  it("as ações da PLU-337 são recusadas e não aparecem como permitidas", () => {
    expect(planejarAcao(saida({ etapa: "aprovada" }), { acao: "registrar_pagamento", forma: "pix", contaCorrenteId: "00000000-0000-0000-0000-000000000001", pagoEm: "2026-11-23" }))
      .toMatchObject({ codigo: "CONFLITO_ESTADO" });
    expect(acoesPermitidas(saida({ etapa: "aprovada" }), GERENTE)).toEqual(["cancelar"]);
  });

  it("acoesPermitidas segue etapa e papel", () => {
    expect(acoesPermitidas(saida(), GERENTE)).toEqual(["aprovar", "cancelar"]);
    expect(acoesPermitidas(saida(), MEMBRO_PAGAR)).toEqual(["cancelar"]);
    expect(acoesPermitidas(saida({ etapa: "paga" }), GERENTE)).toEqual([]);
  });

  it("editar: antes de liquidar, fora do cancelado, no tipo da pessoa", () => {
    expect(podeEditar(saida({ etapa: "aprovada" }), MEMBRO_PAGAR)).toBe(true);
    expect(podeEditar(saida({ etapa: "paga" }), MEMBRO_PAGAR)).toBe(false);
    expect(podeEditar(saida({ canceladoEm: AGORA }), MEMBRO_PAGAR)).toBe(false);
    expect(podeEditar(entrada(), MEMBRO_PAGAR)).toBe(false);
  });
});

describe("filtro de Situação", () => {
  it("sem situação, tudo menos os cancelados; cancelado só no próprio filtro", () => {
    expect(condicaoDaSituacao(undefined)).toEqual({ cancelado: false });
    expect(condicaoDaSituacao("cancelado")).toEqual({ cancelado: true });
  });

  it("os grupos do protótipo", () => {
    expect(condicaoDaSituacao("receber-gerado").etapas).toEqual(["gerada", "nf_emitida", "boleto_gerado"]);
    expect(condicaoDaSituacao("receber-cobranca").etapas).toEqual(["enviada"]);
    expect(condicaoDaSituacao("concluido").etapas).toEqual(["paga", "recebida", "conciliada"]);
    expect(condicaoDaSituacao("vencidos")).toMatchObject({ vencido: true });
    expect(condicaoDaSituacao("erro")).toMatchObject({ omieComErro: true });
  });
});
