import { describe, expect, it } from "vitest";

import { chaveDoEnvio, ehTituloNoOmie, enviosDoFato } from "./omie-envios.rules";

const saida = (etapa: "aberta" | "aprovada" | "paga") => ({ tipo: "saida" as const, etapa });
const entrada = (etapa: "gerada" | "nf_emitida" | "boleto_gerado" | "enviada" | "recebida") => ({ tipo: "entrada" as const, etapa });

describe("envios ao OMIE por fato do lançamento (PLU-342)", () => {
  it("criar: a cobrança manual nasce título; a conta a pagar aberta ainda não vai", () => {
    expect(enviosDoFato(entrada("gerada"), "criado", false)).toEqual(["upsert"]);
    expect(enviosDoFato(saida("aberta"), "criado", false)).toEqual([]);
  });

  it("aprovar a saída envia a conta; pagar e receber enviam a baixa", () => {
    expect(enviosDoFato(saida("aberta"), "aprovado", false)).toEqual(["upsert"]);
    expect(enviosDoFato(saida("aprovada"), "pago", true)).toEqual(["baixa"]);
    expect(enviosDoFato(entrada("enviada"), "recebido", true)).toEqual(["baixa"]);
  });

  it("corrigir o valor e editar: saída aberta não vai; título reenvia a conta; o boleto segue manual, sem gerar_boleto", () => {
    expect(enviosDoFato(saida("aberta"), "valor_corrigido", false)).toEqual([]);
    expect(enviosDoFato(saida("aprovada"), "valor_corrigido", true)).toEqual(["upsert"]);
    expect(enviosDoFato(entrada("boleto_gerado"), "valor_corrigido", true)).toEqual(["upsert"]);
    expect(enviosDoFato(entrada("enviada"), "valor_corrigido", true)).toEqual(["upsert"]);
    expect(ehTituloNoOmie(saida("aberta"))).toBe(false);
    expect(enviosDoFato(saida("aberta"), "editado", false)).toEqual([]);
    expect(enviosDoFato(saida("aprovada"), "editado", true)).toEqual(["upsert"]);
    expect(enviosDoFato(entrada("gerada"), "editado", true)).toEqual(["upsert"]);
  });

  it("cancelar só vai ao OMIE se a conta já chegou lá; marcos da cobrança não vão", () => {
    expect(enviosDoFato(saida("aprovada"), "cancelado", false)).toEqual([]);
    expect(enviosDoFato(saida("aprovada"), "cancelado", true)).toEqual(["cancelar"]);
    for (const marco of ["nf_registrada", "boleto_registrado", "enviado", "cobranca_registrada"] as const) {
      expect(enviosDoFato(entrada("gerada"), marco, true)).toEqual([]);
    }
  });

  it("a chave da fila separa empresa, lançamento e operação", () => {
    expect(chaveDoEnvio("waze", "l-1", "baixa")).toBe("omie:waze:lancamento:l-1:baixa");
  });
});
