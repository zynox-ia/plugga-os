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
});
