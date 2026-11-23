import { describe, expect, it } from "vitest";

import type { Plano } from "./financeiro.rules";
import { chaveDoEnvio, ehTituloNoOmie, enviosDaAcao, enviosDaEdicao } from "./omie-envios.rules";

const saida = (etapa: "aberta" | "aprovada" | "paga") => ({ tipo: "saida" as const, etapa });
const entrada = (etapa: "gerada" | "nf_emitida" | "boleto_gerado" | "enviada" | "recebida") => ({ tipo: "entrada" as const, etapa });
const corrigir: Plano = { tipo: "corrigir_valor", valor: "10.00", motivo: "x" };

describe("envios ao OMIE por ação (PLU-342)", () => {
  it("aprovar a saída envia a conta; pagar e receber enviam a baixa", () => {
    expect(enviosDaAcao(saida("aberta"), { tipo: "aprovar", etapa: "aprovada" }, false)).toEqual(["upsert"]);
    expect(enviosDaAcao(saida("aprovada"), { tipo: "registrar_pagamento", etapa: "paga", forma: "pix", contaCorrenteId: "c", pagoEm: "2026-11-20" }, true)).toEqual(["baixa"]);
    expect(enviosDaAcao(entrada("enviada"), { tipo: "registrar_recebimento", etapa: "recebida", contaCorrenteId: "c", recebidoEm: "2026-11-20", valor: "1.00" }, true)).toEqual(["baixa"]);
  });

  it("corrigir o valor: saída aberta não vai; título reenvia; depois do boleto, boleto novo também (decisão a)", () => {
    expect(enviosDaAcao(saida("aberta"), corrigir, false)).toEqual([]);
    expect(enviosDaAcao(saida("aprovada"), corrigir, true)).toEqual(["upsert"]);
    expect(enviosDaAcao(entrada("nf_emitida"), corrigir, true)).toEqual(["upsert"]);
    expect(enviosDaAcao(entrada("boleto_gerado"), corrigir, true)).toEqual(["upsert", "gerar_boleto"]);
    expect(enviosDaAcao(entrada("enviada"), corrigir, true)).toEqual(["upsert", "gerar_boleto"]);
  });

  it("cancelar só vai ao OMIE se a conta já chegou lá; marcos da cobrança não vão", () => {
    expect(enviosDaAcao(saida("aprovada"), { tipo: "cancelar", motivo: "x" }, false)).toEqual([]);
    expect(enviosDaAcao(saida("aprovada"), { tipo: "cancelar", motivo: "x" }, true)).toEqual(["cancelar"]);
    expect(enviosDaAcao(entrada("gerada"), { tipo: "registrar_nf", etapa: "nf_emitida", numero: "1" }, true)).toEqual([]);
    expect(enviosDaAcao(entrada("enviada"), { tipo: "registrar_cobranca", canal: "whatsapp", nota: null }, true)).toEqual([]);
  });

  it("editar reenvia só o que já é título no OMIE", () => {
    expect(ehTituloNoOmie(saida("aberta"))).toBe(false);
    expect(enviosDaEdicao(saida("aberta"))).toEqual([]);
    expect(enviosDaEdicao(saida("aprovada"))).toEqual(["upsert"]);
    expect(enviosDaEdicao(entrada("gerada"))).toEqual(["upsert"]);
  });

  it("a chave da fila separa empresa, lançamento e operação", () => {
    expect(chaveDoEnvio("waze", "l-1", "baixa")).toBe("omie:waze:lancamento:l-1:baixa");
  });
});
