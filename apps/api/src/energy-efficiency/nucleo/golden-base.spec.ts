import { faturaNormativaSchema, type FaturaNormativa } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import {
  GOLDEN_FATURA_CASES,
  type FaturaConciliadaEsperada,
  type GoldenFaturaCase,
} from "../fatura/golden/concessionarias-golden-base.js";
import { conciliarFatura } from "./conciliacao.js";

/**
 * Regressão da Trava 1 contra a base golden externa (`concessionarias-golden-base.ts`),
 * extraída do acervo OpenClaw e trazida pelo agente de conferência.
 *
 * Ao contrário de `conciliacao.spec.ts` — que lê os 27 pares brutos/conciliados
 * versionados em `packages/auditoria-oraculo/referencia` —, esta suíte parte de
 * casos já conciliados (`expected`), com Âmbar Energia AM, Amazonas Energia,
 * Roraima Energia, Energisa Rondônia, Energisa Acre e Equatorial Pará. 33 dos 60
 * casos não existem no corpus congelado: é cobertura nova, não duplicada.
 *
 * O leitor genérico não muda por concessionária — só se prova aqui que, uma vez
 * normalizada, cada fatura sobrevive à mesma Trava 1 que roda em produção.
 */

type Json = Record<string, unknown>;

function paraCamel(chave: string): string {
  return chave.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase());
}

function camelizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(camelizar);
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Json).map(([chave, filho]) => [paraCamel(chave), camelizar(filho)]),
    );
  }
  return valor;
}

/**
 * `expected` traz campos que só o relatório usa (apelido, nome_analise, fonte
 * etc.) e alguns `null` onde a fatura normativa espera `undefined` em campos
 * não-nullish do schema (ex.: `ultrapassagem_kw`). O schema é estrito, então só
 * os campos que ele conhece atravessam, e os `null` fora dos campos `nullish()`
 * são descartados — a mesma regra que `conciliacao.spec.ts` já aplica ao corpus.
 */
function paraFaturaNormativa(expected: FaturaConciliadaEsperada): FaturaNormativa {
  const camel = camelizar(expected) as Json;
  const aceitos = Object.keys(faturaNormativaSchema.shape) as (keyof FaturaNormativa)[];
  const filtrado = Object.fromEntries(
    Object.entries(camel).filter(([chave, valor]) => {
      if (!aceitos.includes(chave as keyof FaturaNormativa)) return false;
      const campo = faturaNormativaSchema.shape[chave as keyof FaturaNormativa];
      const aceitaNulo = "isNullable" in campo && typeof campo.isNullable === "function"
        ? campo.isNullable()
        : false;
      return valor !== null || aceitaNulo;
    }),
  );
  return faturaNormativaSchema.parse(filtrado);
}

describe("Trava 1 — base golden das concessionárias (Âmbar, Amazonas, Roraima, Energisa, Equatorial)", () => {
  it("a base traz os 56 casos gerados pelo agente de conferência", () => {
    expect(GOLDEN_FATURA_CASES.length).toBe(56);
  });

  it.each(GOLDEN_FATURA_CASES as readonly GoldenFaturaCase[])(
    "$id ($distribuidora) fecha a Trava 1 com a prova do caso",
    (caso) => {
      const fatura = paraFaturaNormativa(caso.expected);
      const resultado = conciliarFatura(fatura);

      expect(resultado.problemas).toEqual([]);
      expect(resultado.conciliada).toBe(true);
      expect(resultado.prova.somaItens).toBeCloseTo(caso.checks.somaItens, 2);
      expect(resultado.prova.total).toBe(caso.checks.total);
      expect(Math.abs(resultado.prova.diferenca)).toBeLessThanOrEqual(0.005);

      // Identidade do caso.
      expect(fatura.distribuidora).toBe(caso.distribuidora);
      expect(fatura.uc).toBe(caso.uc);
      expect(fatura.referencia).toBe(caso.referencia);
      expect(fatura.total).toBe(caso.total);

      // Itens faturados e informativos.
      expect(fatura.itens.length).toBe(caso.checks.itensCount);
      expect((fatura.naoCobrados ?? []).length).toBe(caso.checks.naoCobradosCount);

      // Consumo e tarifas.
      expect(fatura.consumoPontaKwh).toBe(caso.expected.consumo_ponta_kwh);
      expect(fatura.consumoFpKwh).toBe(caso.expected.consumo_fp_kwh);
      if (caso.expected.tarifa_ponta_total !== undefined) {
        expect(fatura.tarifaPontaTotal).toBeCloseTo(caso.expected.tarifa_ponta_total as number, 6);
      }
      if (caso.expected.tarifa_fp_total !== undefined) {
        expect(fatura.tarifaFpTotal).toBeCloseTo(caso.expected.tarifa_fp_total as number, 6);
      }

      // Demanda contratada e registrada.
      expect(fatura.demandaContratadaKw).toBe(caso.expected.demanda_contratada_kw);
      if (caso.expected.demanda_registrada_ponta_kw !== undefined) {
        expect(fatura.demandaRegistradaPontaKw).toBe(caso.expected.demanda_registrada_ponta_kw);
      }
      if (caso.expected.demanda_registrada_fp_kw !== undefined) {
        expect(fatura.demandaRegistradaFpKw).toBe(caso.expected.demanda_registrada_fp_kw);
      }

      // demandaComplementoValor: linha explícita de demanda sem ICMS, nunca sobrescrita por rateio.
      // `checks.temDemandaComplementoValor` reflete a presença da chave, não o valor — cinco
      // casos do corpus normativo trazem `null` (ausente, não zero; ver conciliacao.spec.ts).
      expect(caso.expected.demanda_complemento_valor !== undefined).toBe(
        caso.checks.temDemandaComplementoValor,
      );
      if (caso.expected.demanda_complemento_valor != null) {
        expect(fatura.demandaComplementoValor).toBe(caso.expected.demanda_complemento_valor);
      }

      // NF de mercado livre, quando existir.
      expect(!!fatura.energiaNf).toBe(caso.checks.temEnergiaNf);
      if (caso.checks.temEnergiaNf) {
        expect(fatura.energiaNf?.fornecedor).toBe(
          (caso.expected.energia_nf as { fornecedor?: string } | undefined)?.fornecedor,
        );
      }
    },
  );

  it("cobre as seis distribuidoras documentadas no README", () => {
    const distribuidoras = new Set(GOLDEN_FATURA_CASES.map((caso) => caso.distribuidora));
    expect(distribuidoras).toEqual(
      new Set([
        "Ambar Energia AM",
        "Energisa Rondonia",
        "Amazonas Energia",
        "Roraima Energia",
        "Energisa Acre",
        "Equatorial Para",
      ]),
    );
  });
});
