import type { Acesso } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { inicioDoDiaEmManaus } from "../compras/dias-uteis";
import {
  acoesPermitidas,
  codigoDoLancamento,
  condicaoDaSituacao,
  outraPernaDaTransferencia,
  diasParaVencer,
  emCobranca,
  fimDoMesEmManaus,
  numeroDaBusca,
  papelNoFinanceiro,
  SEM_ANEXOS,
  pendenciasDoLancamento,
  planejarAcao,
  podeEditar,
  podeExecutar,
  prazoDoLancamento,
  problemaDaEdicao,
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
    // Com CP ou CR, fora das transferências; com TR, só as pernas delas (C6); sem prefixo, tudo.
    expect(numeroDaBusca("CP-0412")).toEqual({ tipo: "saida", numero: 412, transferencia: false });
    expect(numeroDaBusca("cr 2081")).toEqual({ tipo: "entrada", numero: 2081, transferencia: false });
    expect(numeroDaBusca("TR-0012")).toEqual({ tipo: null, numero: 12, transferencia: true });
    expect(numeroDaBusca("412")).toEqual({ tipo: null, numero: 412 });
    expect(numeroDaBusca("Hotel")).toBeNull();
  });

  it("o código da perna de uma transferência é o da transferência, com o sentido", () => {
    expect(codigoDoLancamento("saida", 12, "transferencia")).toBe("TR-0012 · saída");
    expect(codigoDoLancamento("entrada", 12, "transferencia")).toBe("TR-0012 · entrada");
    expect(codigoDoLancamento("saida", 12, "avulsa")).toBe("CP-0012");
    expect(condicaoDaSituacao("transferencias")).toEqual({ transferencias: true, cancelado: false });
  });

  it("a outra perna sai do sentido oposto; sem acesso a ela (RLS), o id é nulo e nunca aponta para a própria", () => {
    const entrada = { id: "e", tipo: "entrada" as const };
    const saida = { id: "s", tipo: "saida" as const };
    expect(outraPernaDaTransferencia(entrada, 12, [entrada, saida])).toEqual({ id: "s", codigo: "TR-0012 · saída" });
    expect(outraPernaDaTransferencia(saida, 12, [saida, entrada])).toEqual({ id: "e", codigo: "TR-0012 · entrada" });
    // Só com Contas a receber, a saída não vem em `pernas`.
    expect(outraPernaDaTransferencia(entrada, 12, [entrada])).toEqual({ id: null, codigo: "TR-0012 · saída" });
  });
});

describe("ações", () => {
  it("aprovar: só saída aberta, só gerente", () => {
    expect(planejarAcao(saida(), { acao: "aprovar" }, SEM_ANEXOS, AGORA)).toEqual({ tipo: "aprovar", etapa: "aprovada" });
    expect(planejarAcao(saida({ etapa: "aprovada" }), { acao: "aprovar" }, SEM_ANEXOS, AGORA)).toMatchObject({ codigo: "CONFLITO_ESTADO" });
    expect(planejarAcao(entrada(), { acao: "aprovar" }, SEM_ANEXOS, AGORA)).toMatchObject({ codigo: "CONFLITO_ESTADO" });
    expect(podeExecutar(MEMBRO_PAGAR, saida(), "aprovar")).toBe(false);
    expect(podeExecutar(GERENTE, saida(), "aprovar")).toBe(true);
    expect(podeExecutar(ADMIN, saida(), "aprovar")).toBe(true);
  });

  it("cancelar: antes de liquidar, nunca o cancelado; a aprovada só pela gerente", () => {
    expect(planejarAcao(saida(), { acao: "cancelar", motivo: "Duplicada" }, SEM_ANEXOS, AGORA)).toEqual({ tipo: "cancelar", motivo: "Duplicada" });
    expect(planejarAcao(saida({ etapa: "paga" }), { acao: "cancelar", motivo: "x" }, SEM_ANEXOS, AGORA)).toMatchObject({ codigo: "CONFLITO_ESTADO" });
    expect(planejarAcao(saida({ canceladoEm: AGORA }), { acao: "cancelar", motivo: "x" }, SEM_ANEXOS, AGORA)).toMatchObject({ codigo: "CONFLITO_ESTADO" });
    expect(podeExecutar(MEMBRO_PAGAR, saida(), "cancelar")).toBe(true);
    expect(podeExecutar(MEMBRO_PAGAR, saida({ etapa: "aprovada" }), "cancelar")).toBe(false);
    expect(podeExecutar(MEMBRO_RECEBER, entrada({ etapa: "enviada" }), "cancelar")).toBe(true);
  });

  it("fora do tipo, nenhuma ação", () => {
    expect(podeExecutar(MEMBRO_RECEBER, saida(), "cancelar")).toBe(false);
    expect(acoesPermitidas(saida(), MEMBRO_RECEBER, SEM_ANEXOS, AGORA)).toEqual([]);
  });

  it("acoesPermitidas segue etapa e papel", () => {
    expect(acoesPermitidas(saida(), GERENTE, SEM_ANEXOS, AGORA)).toEqual(["aprovar", "cancelar", "corrigir_valor"]);
    expect(acoesPermitidas(saida(), MEMBRO_PAGAR, SEM_ANEXOS, AGORA)).toEqual(["cancelar", "corrigir_valor"]);
    // O pagamento aparece mesmo antes do comprovante: a tela o habilita depois do anexo.
    expect(acoesPermitidas(saida({ etapa: "aprovada" }), MEMBRO_PAGAR, SEM_ANEXOS, AGORA)).toEqual(["registrar_pagamento"]);
    expect(acoesPermitidas(saida({ etapa: "aprovada" }), GERENTE, SEM_ANEXOS, AGORA)).toEqual(["cancelar", "corrigir_valor", "registrar_pagamento"]);
    // O liquidado e não conciliado: só a gerência corrige o valor (o "Valor diferente" da Conciliação).
    expect(acoesPermitidas(saida({ etapa: "paga" }), GERENTE, SEM_ANEXOS, AGORA)).toEqual(["corrigir_valor"]);
    expect(acoesPermitidas(saida({ etapa: "paga" }), MEMBRO_PAGAR, SEM_ANEXOS, AGORA)).toEqual([]);
    expect(acoesPermitidas(entrada({ etapa: "recebida" }), MEMBRO_RECEBER, SEM_ANEXOS, AGORA)).toEqual([]);
    expect(acoesPermitidas(saida({ etapa: "conciliada" }), GERENTE, SEM_ANEXOS, AGORA)).toEqual([]);
    expect(acoesPermitidas(entrada({ etapa: "enviada" }), MEMBRO_RECEBER, SEM_ANEXOS, AGORA)).toEqual(["cancelar", "corrigir_valor", "registrar_cobranca", "registrar_recebimento"]);
  });
});

describe("edição", () => {
  it("editar: antes de liquidar, fora do cancelado, no tipo da pessoa", () => {
    expect(podeEditar(saida({ etapa: "aprovada" }), MEMBRO_PAGAR)).toBe(true);
    expect(podeEditar(saida({ etapa: "paga" }), MEMBRO_PAGAR)).toBe(false);
    expect(podeEditar(saida({ canceladoEm: AGORA }), MEMBRO_PAGAR)).toBe(false);
    expect(podeEditar(entrada(), MEMBRO_PAGAR)).toBe(false);
  });
});

describe("ações da PLU-337", () => {
  const COM_COMPROVANTE = { comprovante: true, boleto: false };
  const pagar = (pagoEm: string) => ({ acao: "registrar_pagamento" as const, forma: "pix" as const, contaCorrenteId: "00000000-0000-0000-0000-000000000001", pagoEm });

  it("pagar exige a conta aprovada, o comprovante já anexado e o dia que não é futuro", () => {
    expect(planejarAcao(saida({ etapa: "aprovada" }), pagar("2026-11-23"), SEM_ANEXOS, AGORA)).toMatchObject({ codigo: "CONFLITO_ESTADO", campo: "comprovante" });
    expect(planejarAcao(saida({ etapa: "aprovada" }), pagar("2026-11-23"), COM_COMPROVANTE, AGORA)).toMatchObject({ tipo: "registrar_pagamento", etapa: "paga" });
    // 23/11 às 22h em Manaus: 24/11 ainda é futuro.
    expect(planejarAcao(saida({ etapa: "aprovada" }), pagar("2026-11-24"), COM_COMPROVANTE, AGORA)).toMatchObject({ codigo: "REQUISICAO_INVALIDA", campo: "pagoEm" });
    expect(planejarAcao(saida(), pagar("2026-11-23"), COM_COMPROVANTE, AGORA)).toMatchObject({ codigo: "CONFLITO_ESTADO" });
  });

  it("a entrada anda gerada → NF → boleto (com o anexo) → enviada → recebida", () => {
    expect(planejarAcao(entrada(), { acao: "registrar_nf", numero: "NFS-e 1" }, SEM_ANEXOS, AGORA)).toMatchObject({ etapa: "nf_emitida" });
    expect(planejarAcao(entrada({ etapa: "nf_emitida" }), { acao: "registrar_boleto" }, SEM_ANEXOS, AGORA)).toMatchObject({ codigo: "CONFLITO_ESTADO", campo: "boleto" });
    expect(planejarAcao(entrada({ etapa: "nf_emitida" }), { acao: "registrar_boleto" }, { comprovante: false, boleto: true }, AGORA)).toMatchObject({ etapa: "boleto_gerado" });
    expect(planejarAcao(entrada({ etapa: "boleto_gerado" }), { acao: "registrar_envio", canal: "E-mail" }, SEM_ANEXOS, AGORA)).toMatchObject({ etapa: "enviada" });
    expect(planejarAcao(entrada({ etapa: "enviada" }), { acao: "registrar_recebimento", contaCorrenteId: "00000000-0000-0000-0000-000000000001", recebidoEm: "2026-11-23", valor: "10.00" }, SEM_ANEXOS, AGORA))
      .toMatchObject({ etapa: "recebida" });
    // Fora de ordem, conflito.
    expect(planejarAcao(entrada(), { acao: "registrar_envio", canal: "E-mail" }, SEM_ANEXOS, AGORA)).toMatchObject({ codigo: "CONFLITO_ESTADO" });
    expect(planejarAcao(saida(), { acao: "registrar_nf", numero: "x" }, SEM_ANEXOS, AGORA)).toMatchObject({ codigo: "CONFLITO_ESTADO" });
  });

  it("a cobrança registrada não muda a etapa; corrigir o valor até conciliar, e o liquidado só pela gerência", () => {
    expect(planejarAcao(entrada({ etapa: "enviada" }), { acao: "registrar_cobranca", canal: "WhatsApp", nota: "Pediu 2ª via" }, SEM_ANEXOS, AGORA))
      .toEqual({ tipo: "registrar_cobranca", canal: "WhatsApp", nota: "Pediu 2ª via" });
    const corrigir = { acao: "corrigir_valor" as const, valor: "10.00", motivo: "Juros" };
    expect(planejarAcao(saida({ etapa: "paga" }), corrigir, SEM_ANEXOS, AGORA)).toEqual({ tipo: "corrigir_valor", valor: "10.00", motivo: "Juros" });
    expect(planejarAcao(entrada({ etapa: "recebida" }), corrigir, SEM_ANEXOS, AGORA)).toMatchObject({ tipo: "corrigir_valor" });
    expect(planejarAcao(saida({ etapa: "conciliada" }), corrigir, SEM_ANEXOS, AGORA))
      .toEqual({ codigo: "CONFLITO_ESTADO", mensagem: "Depois de conciliado, o valor não se corrige: desfaça a conciliação primeiro." });
    expect(podeExecutar(MEMBRO_PAGAR, saida({ etapa: "paga" }), "corrigir_valor")).toBe(false);
    expect(podeExecutar(MEMBRO_RECEBER, entrada({ etapa: "recebida" }), "corrigir_valor")).toBe(false);
    expect(podeExecutar(GERENTE, entrada({ etapa: "recebida" }), "corrigir_valor")).toBe(true);
    // Antes de liquidar, a entrada segue de qualquer membro do Contas a receber.
    expect(podeExecutar(MEMBRO_RECEBER, entrada({ etapa: "enviada" }), "corrigir_valor")).toBe(true);
    expect(podeExecutar(MEMBRO_PAGAR, saida({ etapa: "aprovada" }), "corrigir_valor")).toBe(false);
    expect(podeExecutar(GERENTE, saida({ etapa: "aprovada" }), "corrigir_valor")).toBe(true);
  });

  it("depois do boleto, corrigir o valor exige o boleto novo anexado (decisão a)", () => {
    const corrigir = { acao: "corrigir_valor" as const, valor: "10.00", motivo: "Ajuste" };
    for (const etapa of ["boleto_gerado", "enviada"] as const) {
      expect(planejarAcao(entrada({ etapa }), corrigir, { comprovante: false, boleto: true, boletoNovo: false }, AGORA)).toMatchObject({ codigo: "CONFLITO_ESTADO", campo: "boleto" });
      expect(planejarAcao(entrada({ etapa }), corrigir, { comprovante: false, boleto: true, boletoNovo: true }, AGORA)).toMatchObject({ tipo: "corrigir_valor" });
    }
    // Antes do boleto, corrige direto.
    expect(planejarAcao(entrada({ etapa: "nf_emitida" }), corrigir, SEM_ANEXOS, AGORA)).toMatchObject({ tipo: "corrigir_valor" });
  });

  it("o painel O que falta segue o fluxo de cada tipo", () => {
    expect(pendenciasDoLancamento(saida({ etapa: "aprovada" }), COM_COMPROVANTE).map((p) => [p.texto, p.feito]))
      .toEqual([["Aprovar", true], ["Anexar o comprovante", true], ["Registrar o pagamento", false], ["Conciliar com o extrato", false]]);
    const daEntrada = pendenciasDoLancamento(entrada({ etapa: "enviada" }), { comprovante: false, boleto: true });
    expect(daEntrada.filter((p) => p.feito).map((p) => p.texto)).toEqual(["Emitir a NF", "Gerar o boleto", "Enviar ao cliente"]);
    expect(daEntrada.find((p) => p.texto.startsWith("Anexar"))?.opcional).toBe(true);
  });

  it("a despesa sem categoria (CC14) pede a classificação primeiro, sem travar o resto do fluxo", () => {
    const semCategoria = pendenciasDoLancamento({ ...saida({ etapa: "aprovada" }), categoriaId: null }, COM_COMPROVANTE);
    expect(semCategoria[0]).toEqual({ texto: "Classificar a categoria", feito: false });
    expect(semCategoria.slice(1).map((p) => p.texto)).toEqual(["Aprovar", "Anexar o comprovante", "Registrar o pagamento", "Conciliar com o extrato"]);
    expect(pendenciasDoLancamento({ ...saida({ etapa: "aprovada" }), categoriaId: "c-1" }, COM_COMPROVANTE).map((p) => p.texto)).not.toContain("Classificar a categoria");
  });
});

describe("edição da conta aprovada", () => {
  const aprovada = { ...saida({ etapa: "aprovada" }), origem: "avulsa" as const };

  it("na aprovada, só a gerente muda fornecedor, conta, forma ou vencimento", () => {
    for (const campo of ["fornecedorId", "contaCorrenteId", "forma", "vencimento"]) {
      expect(problemaDaEdicao(aprovada, [campo], MEMBRO_PAGAR), campo).toMatchObject({ codigo: "ACESSO_NEGADO" });
      expect(problemaDaEdicao(aprovada, [campo], GERENTE), campo).toBeNull();
    }
    expect(problemaDaEdicao(aprovada, ["descricao", "observacao"], MEMBRO_PAGAR)).toBeNull();
    // Antes da aprovação, o membro edita tudo.
    expect(problemaDaEdicao({ ...saida(), origem: "avulsa" }, ["fornecedorId", "vencimento"], MEMBRO_PAGAR)).toBeNull();
  });

  it("na conta do pedido de compra, o fornecedor não muda, nem pela gerente", () => {
    expect(problemaDaEdicao({ ...aprovada, origem: "pedido_de_compra" }, ["fornecedorId"], GERENTE)).toMatchObject({ codigo: "REQUISICAO_INVALIDA" });
  });

  it("cobrança não tem fornecedor; liquidado não se edita", () => {
    expect(problemaDaEdicao({ ...entrada(), origem: "cobranca_manual" }, ["fornecedorId"], GERENTE)).toMatchObject({ codigo: "REQUISICAO_INVALIDA" });
    expect(problemaDaEdicao({ ...saida({ etapa: "paga" }), origem: "avulsa" }, ["descricao"], GERENTE)).toMatchObject({ codigo: "CONFLITO_ESTADO" });
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
  });
});
