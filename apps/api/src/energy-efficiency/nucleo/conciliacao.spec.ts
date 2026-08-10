import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { faturaNormativaSchema, type FaturaNormativa } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { conciliarFatura } from "./conciliacao.js";

/**
 * Regressão da Trava 1 contra o corpus normativo.
 *
 * O corpus está versionado em `packages/auditoria-oraculo/referencia` e é lido
 * por caminho, não por dependência: a árvore congelada é tooling e não pode
 * entrar no caminho produtivo.
 *
 * O que se prova aqui: as 27 faturas brutas produzem exatamente a mesma prova
 * de conciliação que o oráculo Python gravou nas 27 conciliadas.
 */
const CASOS = join(
  __dirname,
  "../../../../../packages/auditoria-oraculo/referencia",
  "skill-estudo-eficiencia-energetica/casos",
);

type Json = Record<string, unknown>;

function paraCamel(chave: string): string {
  return chave.replace(/_([a-z])/g, (_, letra: string) => letra.toUpperCase());
}

function camelizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(camelizar);
  if (valor !== null && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Json).map(([chave, filho]) => [
        paraCamel(chave),
        camelizar(filho),
      ]),
    );
  }
  return valor;
}

/**
 * O corpus traz campos que a norma usa em outras etapas — tarifas de demanda,
 * benefícios, textos de exibição. A Trava 1 não os consome, e o contrato é
 * estrito, então ficam de fora do que é carregado aqui.
 */
function carregarFatura(arquivo: string): FaturaNormativa {
  const bruto = camelizar(
    JSON.parse(readFileSync(join(CASOS, arquivo), "utf8")),
  ) as Json;
  const aceitos = Object.keys(faturaNormativaSchema.shape);
  const filtrado = Object.fromEntries(
    Object.entries(bruto).filter(([chave]) => aceitos.includes(chave)),
  );
  return faturaNormativaSchema.parse(filtrado);
}

function lerProvaDoOraculo(arquivo: string): {
  somaItens: number;
  total: number;
  diferenca: number;
} {
  const conciliada = JSON.parse(readFileSync(join(CASOS, arquivo), "utf8")) as {
    conciliada: boolean;
    prova: { soma_itens: number; total: number; diferenca: number };
  };
  expect(conciliada.conciliada).toBe(true);
  return {
    somaItens: conciliada.prova.soma_itens,
    total: conciliada.prova.total,
    diferenca: conciliada.prova.diferenca,
  };
}

const brutas = readdirSync(CASOS)
  .filter((nome) => nome.startsWith("fatura-") && nome.endsWith(".json"))
  .filter((nome) => !nome.endsWith("_conciliada.json"))
  .sort();

describe("Trava 1 — conciliação contra o corpus normativo", () => {
  it("o corpus tem as 27 faturas e as 27 conciliadas", () => {
    expect(brutas).toHaveLength(27);
    expect(
      readdirSync(CASOS).filter((nome) => nome.endsWith("_conciliada.json")),
    ).toHaveLength(27);
  });

  it.each(brutas)("%s fecha com a prova do oráculo", (arquivo) => {
    const resultado = conciliarFatura(carregarFatura(arquivo));
    const esperado = lerProvaDoOraculo(arquivo.replace(".json", "_conciliada.json"));

    expect(resultado.problemas).toEqual([]);
    expect(resultado.conciliada).toBe(true);
    expect(resultado.prova).toEqual(esperado);
  });
});

describe("Trava 1 — o que ela recusa", () => {
  const santaTereza = () => carregarFatura("fatura-santa-tereza-2026-06.json");
  const cantuaria = () => carregarFatura("fatura-cantuaria-2026-06.json");

  it("um centavo a mais no total reprova", () => {
    const fatura = santaTereza();
    const resultado = conciliarFatura({ ...fatura, total: fatura.total + 0.01 });

    expect(resultado.conciliada).toBe(false);
    expect(resultado.problemas[0]?.regra).toBe("soma_dos_itens");
  });

  it("meio centavo passa, porque a tolerância é essa", () => {
    const fatura = santaTereza();
    const resultado = conciliarFatura({ ...fatura, total: fatura.total + 0.004 });

    expect(resultado.conciliada).toBe(true);
  });

  it("item esquecido reprova, e a prova mostra a diferença", () => {
    const fatura = santaTereza();
    const resultado = conciliarFatura({ ...fatura, itens: fatura.itens.slice(0, -1) });

    expect(resultado.conciliada).toBe(false);
    expect(resultado.prova.diferenca).toBeCloseTo(-33.98, 2);
  });

  it("tarifa adulterada reprova o item mesmo com o total fechando", () => {
    const fatura = santaTereza();
    const [primeiro, ...resto] = fatura.itens;
    const resultado = conciliarFatura({
      ...fatura,
      itens: [{ ...primeiro!, tarifa: (primeiro!.tarifa ?? 0) * 2 }, ...resto],
    });

    expect(resultado.conciliada).toBe(false);
    expect(resultado.problemas[0]?.regra).toBe("item_incoerente");
  });

  it("demanda acima da contratada + 5% sem ultrapassagem declarada reprova", () => {
    const fatura = santaTereza();
    const resultado = conciliarFatura({
      ...fatura,
      demandaContratadaKw: 300,
      demandaRegistradaFpKw: 367,
    });

    expect(resultado.problemas.map((problema) => problema.regra)).toContain(
      "ultrapassagem",
    );
  });

  it("a mesma demanda passa quando a ultrapassagem está declarada", () => {
    const fatura = santaTereza();
    const resultado = conciliarFatura({
      ...fatura,
      demandaContratadaKw: 300,
      demandaRegistradaFpKw: 367,
      ultrapassagemValor: 1200,
    });

    expect(resultado.conciliada).toBe(true);
  });

  it("campo obrigatório ausente para tudo antes da aritmética", () => {
    const fatura: Record<string, unknown> = { ...santaTereza() };
    delete fatura.consumoPontaKwh;
    const resultado = conciliarFatura(fatura as unknown as FaturaNormativa);

    expect(resultado.problemas).toEqual([
      { regra: "campo_obrigatorio", detalhe: "campo obrigatório ausente: consumoPontaKwh" },
    ]);
  });

  it("no mercado livre, preço da NF que não deriva do volume reprova", () => {
    const fatura = cantuaria();
    const resultado = conciliarFatura({
      ...fatura,
      energiaNf: { ...fatura.energiaNf!, precoKwh: 0.31 },
    });

    expect(resultado.conciliada).toBe(false);
    expect(resultado.problemas[0]?.regra).toBe("energia_nf");
  });

  it("no mercado livre, tarifa de ponta que não é fio + energia reprova", () => {
    const fatura = cantuaria();
    const resultado = conciliarFatura({ ...fatura, tarifaPontaTotal: 0.6 });

    expect(resultado.conciliada).toBe(false);
    expect(resultado.problemas[0]?.detalhe).toContain("TUSD + energia da NF");
  });
});

describe("Trava 1 — linhas informativas", () => {
  it("a bandeira amarela de Santa Tereza fica fora do total, e isso é dito", () => {
    const resultado = conciliarFatura(
      carregarFatura("fatura-santa-tereza-2026-06.json"),
    );

    expect(resultado.conciliada).toBe(true);
    expect(resultado.foraDoTotal).toEqual([
      {
        nome: "Adicional Bandeira Amarela",
        valor: 3774.59,
        motivo:
          "bandeira Verde R$ 0,00 na referencia — linha informativa fora do total",
      },
    ]);
  });
});
