import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReconciledInvoiceItem } from "@plugga/shared";

import {
  avaliarConciliacaoLocal,
  type CamposDaConciliacao,
  inferirCategoriaDaLinha,
} from "../app/components/conciliacao-model.ts";

const CAMPOS: CamposDaConciliacao = {
  valorTotal: 40,
  consumoPontaKwh: 10,
  consumoForaPontaKwh: 20,
  tarifaPonta: 1,
  tarifaForaPonta: 1,
  valorPonta: 10,
  valorForaPonta: 20,
  valorDemanda: 5,
  tarifaDemanda: 1,
  demandaContratadaKw: 100,
  demandaMedidaPontaKw: 80,
  demandaMedidaForaPontaKw: 90,
  valorReativo: 2,
  valorBeneficioFiscal: 0,
  valorMultasJurosEncargos: 3,
};

const ITENS: ReconciledInvoiceItem[] = [
  {
    nome: "Consumo ponta",
    categoria: "consumo_ponta",
    compoeTotal: true,
    valor: 10,
    quantidade: 10,
    unidade: "kWh",
    tarifa: 1,
  },
  {
    nome: "Consumo fora ponta",
    categoria: "consumo_fora_ponta",
    compoeTotal: true,
    valor: 20,
    quantidade: 20,
    unidade: "kWh",
    tarifa: 1,
  },
  {
    nome: "Demanda",
    categoria: "demanda_faturada",
    compoeTotal: true,
    valor: 5,
    quantidade: 5,
    unidade: "kW",
    tarifa: 1,
  },
  {
    nome: "Reativo",
    categoria: "reativo",
    compoeTotal: true,
    valor: 2,
    quantidade: null,
    unidade: null,
    tarifa: null,
  },
  {
    nome: "Encargos",
    categoria: "multas_juros_encargos",
    compoeTotal: true,
    valor: 3,
    quantidade: null,
    unidade: null,
    tarifa: null,
  },
];

describe("modelo da conciliação na interface", () => {
  it("libera linhas que provam total e campos críticos e acrescenta metadados de demanda", () => {
    const resultado = avaliarConciliacaoLocal(ITENS, CAMPOS);

    assert.equal(resultado.pronta, true);
    assert.equal(resultado.itens.filter((item) => !item.compoeTotal).length, 3);
    assert.equal(resultado.itens.at(-1)?.quantidade, CAMPOS.demandaMedidaForaPontaKw);
  });

  it("não aceita o próprio total como única linha sintética", () => {
    const resultado = avaliarConciliacaoLocal(
      [
        {
          nome: "Total informado manualmente",
          categoria: "outros",
          compoeTotal: true,
          valor: CAMPOS.valorTotal,
          quantidade: null,
          unidade: null,
          tarifa: null,
        },
      ],
      CAMPOS,
    );

    assert.equal(resultado.diferenca, 0);
    assert.equal(resultado.pronta, false);
    assert.ok(resultado.camposInvalidos.includes("ponta"));
  });

  it("bloqueia quando a linha e o snapshot divergem mesmo com o total fechado", () => {
    const itens = ITENS.map((item) =>
      item.categoria === "consumo_ponta" ? { ...item, quantidade: 9 } : item,
    );
    const resultado = avaliarConciliacaoLocal(itens, CAMPOS);

    assert.equal(resultado.diferenca, 0);
    assert.equal(resultado.pronta, false);
    assert.ok(resultado.camposInvalidos.includes("ponta"));
  });

  it("bloqueia tarifa de demanda diferente da linha faturada", () => {
    const resultado = avaliarConciliacaoLocal(ITENS, { ...CAMPOS, tarifaDemanda: 2 });

    assert.equal(resultado.diferenca, 0);
    assert.equal(resultado.pronta, false);
    assert.ok(resultado.camposInvalidos.includes("tarifa de demanda"));
  });

  it("sugere categorias a partir dos rótulos mais comuns", () => {
    assert.equal(inferirCategoriaDaLinha("CONSUMO FORA DE PONTA"), "consumo_fora_ponta");
    assert.equal(inferirCategoriaDaLinha("Energia Reativa Excedente"), "reativo");
    assert.equal(inferirCategoriaDaLinha("Juros e encargos"), "multas_juros_encargos");
  });

  /**
   * Os rótulos são os que as doze faturas do corpus imprimem de verdade,
   * levantados em 11/08/2026 rodando o leitor sobre elas. Não são exemplos
   * inventados: cada um destes já apareceu numa fatura de cliente, e três
   * deles estavam sendo classificados como consumo em ponta.
   */
  it("classifica os rótulos que as distribuidoras realmente imprimem", () => {
    // O que motivou o conserto: a Roraima escreve F/Ponta, não "fora ponta".
    assert.equal(inferirCategoriaDaLinha("Consumo F/Ponta"), "consumo_fora_ponta");
    assert.equal(inferirCategoriaDaLinha("Consumo Ponta"), "consumo_ponta");

    // Reativo abreviado. Estes caíam em consumo em ponta e inflavam o consumo.
    assert.equal(inferirCategoriaDaLinha("En R Exc Ponta"), "reativo");
    assert.equal(inferirCategoriaDaLinha("En R Exc F/Ponta"), "reativo");

    // Demanda vem antes de ponta: as duas linhas da Santa Tereza dizem "Ponta".
    assert.equal(inferirCategoriaDaLinha("Demanda Ponta sem ICMS"), "demanda_faturada");
    assert.equal(inferirCategoriaDaLinha("Demanda Ponta com ICMS"), "demanda_faturada");
    assert.equal(inferirCategoriaDaLinha("Demanda"), "demanda_faturada");

    assert.equal(
      inferirCategoriaDaLinha("Contribuição de Iluminação Pública (COSIP)"),
      "outros",
    );
  });

  /**
   * A Santa Tereza inteira, com os valores que o leitor extrai dela. É o caso
   * que travava o botão de abrir o estudo — e travava por três motivos ao mesmo
   * tempo, então um teste que cobrisse só a categoria continuaria verde com a
   * tela quebrada.
   */
  it("a Santa Tereza fica pronta: duas tarifas de demanda e F/Ponta no lugar certo", () => {
    const itens: ReconciledInvoiceItem[] = [
      { nome: "Consumo Ponta", categoria: inferirCategoriaDaLinha("Consumo Ponta"), compoeTotal: true, valor: 46_842.73, quantidade: 17_419, unidade: "kWh", tarifa: 2.689175 },
      { nome: "Consumo F/Ponta", categoria: inferirCategoriaDaLinha("Consumo F/Ponta"), compoeTotal: true, valor: 114_646.81, quantidade: 183_153, unidade: "kWh", tarifa: 0.625962 },
      { nome: "Demanda Ponta sem ICMS", categoria: inferirCategoriaDaLinha("Demanda Ponta sem ICMS"), compoeTotal: true, valor: 2_947.28, quantidade: 133, unidade: "kW", tarifa: 22.16 },
      { nome: "Demanda Ponta com ICMS", categoria: inferirCategoriaDaLinha("Demanda Ponta com ICMS"), compoeTotal: true, valor: 10_165.9, quantidade: 367, unidade: "kW", tarifa: 27.7 },
      { nome: "COSIP", categoria: "outros", compoeTotal: true, valor: 33.98, quantidade: null, unidade: null, tarifa: null },
    ];

    const resultado = avaliarConciliacaoLocal(itens, {
      valorTotal: 174_636.7,
      consumoPontaKwh: 17_419,
      consumoForaPontaKwh: 183_153,
      tarifaPonta: 2.689175,
      tarifaForaPonta: 0.625962,
      valorPonta: 46_842.73,
      valorForaPonta: 114_646.81,
      valorDemanda: 13_113.18,
      // Uma tarifa declarada para duas linhas com tarifas diferentes: exigir que
      // a média (26,23) batesse com ela reprovava a fatura por estar certa.
      tarifaDemanda: 27.7,
      demandaContratadaKw: 500,
      demandaMedidaPontaKw: 367,
      demandaMedidaForaPontaKw: 0,
      valorReativo: 0,
      valorBeneficioFiscal: 0,
      valorMultasJurosEncargos: 0,
    });

    assert.deepEqual(resultado.camposInvalidos, []);
    assert.equal(resultado.multiplicacoesInvalidas, 0);
    assert.ok(Math.abs(resultado.diferenca) <= 0.005);
    assert.equal(resultado.pronta, true);
  });
});
