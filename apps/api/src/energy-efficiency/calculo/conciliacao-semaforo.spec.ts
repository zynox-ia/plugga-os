import {
  PREMISSAS_2026_08,
  type InvoiceContext,
  type InvoiceData,
} from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { conciliarFatura } from "./conciliacao.js";
import { rodarMotorPrd } from "./motor-prd.js";
import { chaveDoTipo, classificarSemaforo } from "./semaforo.js";

const FATURA: InvoiceData = {
  consumoPontaKwh: 17_419,
  consumoForaPontaKwh: 183_153,
  tarifaPonta: 2.689175,
  tarifaForaPonta: 0.625962,
  valorPonta: 46_842.74,
  valorForaPonta: 114_648.76,
  valorDemanda: 12_632.41,
  valorTotal: 174_636.7,
  demandaContratadaKw: 500,
  demandaMedidaPontaKw: 346,
  demandaMedidaForaPontaKw: 514,
  tarifaDemanda: 25.26482,
  valorReativo: 153.83,
  valorBeneficioFiscal: 0,
  valorMultasJurosEncargos: 0,
};

const CONTEXTO: InvoiceContext = {
  distribuidora: "Roraima Energia",
  regime: "cativo",
  modalidade: "verde",
  grupo: "A",
  vencimento: null,
  itens: [
    {
      nome: "Consumo ponta",
      categoria: "consumo_ponta",
      compoeTotal: true,
      valor: 46_842.74,
      quantidade: 17_419,
      unidade: "kWh",
      tarifa: 2.689175,
    },
    {
      nome: "Consumo fora ponta",
      categoria: "consumo_fora_ponta",
      compoeTotal: true,
      valor: 114_648.76,
      quantidade: 183_153,
      unidade: "kWh",
      tarifa: 0.625962,
    },
    {
      nome: "Demanda faturada",
      categoria: "demanda_faturada",
      compoeTotal: true,
      valor: 12_632.41,
      quantidade: 500,
      unidade: "kW",
      tarifa: 25.26482,
    },
    {
      nome: "Energia reativa",
      categoria: "reativo",
      compoeTotal: true,
      valor: 153.83,
      quantidade: null,
      unidade: null,
      tarifa: null,
    },
    {
      nome: "Outros itens da fatura",
      categoria: "outros",
      compoeTotal: true,
      valor: 358.96,
      quantidade: null,
      unidade: null,
      tarifa: null,
    },
    {
      nome: "Demanda contratada",
      categoria: "demanda_contratada",
      compoeTotal: false,
      valor: 0,
      quantidade: 500,
      unidade: "kW",
      tarifa: null,
    },
    {
      nome: "Demanda medida em ponta",
      categoria: "demanda_medida_ponta",
      compoeTotal: false,
      valor: 0,
      quantidade: 346,
      unidade: "kW",
      tarifa: null,
    },
    {
      nome: "Demanda medida fora ponta",
      categoria: "demanda_medida_fora_ponta",
      compoeTotal: false,
      valor: 0,
      quantidade: 514,
      unidade: "kW",
      tarifa: null,
    },
  ],
  arquivoNome: "santa-tereza.pdf",
  arquivoChave: null,
  origem: "texto_direto",
};

describe("trava de conciliação", () => {
  it("aceita soma e multiplicação dentro da tolerância", () => {
    const resultado = conciliarFatura(FATURA, CONTEXTO);
    expect(resultado.problemas).toEqual([]);
    expect(resultado.prova.somaItens).toBeCloseTo(FATURA.valorTotal, 2);
    expect(resultado.prova.itensConferidos).toBe(3);
  });

  it("bloqueia divergência sem ajustar o total", () => {
    const contexto = {
      ...CONTEXTO,
      itens: CONTEXTO.itens.map((item, indice) =>
        indice === 4 ? { ...item, valor: item.valor - 10 } : item,
      ),
    };
    const resultado = conciliarFatura(FATURA, contexto);
    expect(resultado.problemas.some((problema) => problema.regra === "conciliacao_total")).toBe(
      true,
    );
    expect(resultado.prova.total).toBe(FATURA.valorTotal);
  });

  it("bloqueia snapshot de ponta diferente da linha conciliada", () => {
    const resultado = conciliarFatura({ ...FATURA, consumoPontaKwh: 17_000 }, CONTEXTO);
    expect(
      resultado.problemas.some(
        (problema) =>
          problema.regra === "conciliacao_campo" && problema.detalhe.includes("ponta (kWh)"),
      ),
    ).toBe(true);
  });

  it("bloqueia tarifa de demanda diferente da linha conciliada", () => {
    const resultado = conciliarFatura({ ...FATURA, tarifaDemanda: 30 }, CONTEXTO);
    expect(
      resultado.problemas.some(
        (problema) =>
          problema.regra === "conciliacao_campo" &&
          problema.detalhe.includes("tarifa de demanda"),
      ),
    ).toBe(true);
  });

  it("não aceita linha sintética com o próprio total como única prova", () => {
    const contexto: InvoiceContext = {
      ...CONTEXTO,
      itens: [
        {
          nome: "Total informado manualmente",
          categoria: "outros",
          compoeTotal: true,
          valor: FATURA.valorTotal,
          quantidade: null,
          unidade: null,
          tarifa: null,
        },
      ],
    };
    const resultado = conciliarFatura(FATURA, contexto);
    expect(
      resultado.problemas.filter((problema) => problema.regra === "conciliacao_campo_ausente")
        .length,
    ).toBeGreaterThan(0);
  });
});

describe("semáforo do PRD", () => {
  const motor = rodarMotorPrd(FATURA, PREMISSAS_2026_08);

  it("normaliza a chave do tipo e separa amarelo de verde", () => {
    expect(chaveDoTipo(CONTEXTO)).toBe("roraima energia|cativo|verde|a");
    expect(
      classificarSemaforo({
        fatura: FATURA,
        contexto: CONTEXTO,
        ...motor,
        tipoConhecido: false,
      }).faixa,
    ).toBe("amarelo");
    expect(
      classificarSemaforo({
        fatura: FATURA,
        contexto: CONTEXTO,
        ...motor,
        tipoConhecido: true,
      }).faixa,
    ).toBe("verde");
  });

  it("reconhece acentos, sufixos societários e aliases dos layouts do PRD", () => {
    expect(
      chaveDoTipo({ ...CONTEXTO, distribuidora: "Roraima Energia S.A." }),
    ).toBe("roraima energia|cativo|verde|a");
    expect(
      chaveDoTipo({
        ...CONTEXTO,
        distribuidora: "ENERGISA",
        regime: "mercado_livre",
      }),
    ).toBe("energisa rondonia|mercado_livre|verde|a");
    expect(
      chaveDoTipo({
        ...CONTEXTO,
        distribuidora: "Energisa RO S.A.",
        regime: "mercado_livre",
      }),
    ).toBe("energisa rondonia|mercado_livre|verde|a");
    expect(
      chaveDoTipo({
        ...CONTEXTO,
        distribuidora: "Âmbar Energia Amazonas Ltda.",
        regime: "mercado_livre",
      }),
    ).toBe("ambar energia am|mercado_livre|verde|a");
  });

  it("vermelho prevalece quando o spread supera oito vezes", () => {
    const resultado = classificarSemaforo({
      fatura: { ...FATURA, tarifaPonta: 9, tarifaForaPonta: 1 },
      contexto: CONTEXTO,
      ...motor,
      tipoConhecido: true,
    });
    expect(resultado.faixa).toBe("vermelho");
    expect(resultado.motivos.some((motivo) => motivo.includes("8×"))).toBe(true);
  });
});
