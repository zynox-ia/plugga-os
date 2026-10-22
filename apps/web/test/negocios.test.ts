import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Deal, Pipeline } from "@plugga/shared";

import { mesRelativo, montarCalendario } from "../app/lib/calendario-negocios.ts";

import {
  aplicarFiltros,
  diasNaEtapa,
  estaParado,
  FILTROS_INICIAIS,
  hojeNoFuso,
  hrefDaVisao,
  ordenar,
  somaDosValores,
  valorCurto,
  valorDigitadoParaDecimal,
} from "../app/lib/negocios.ts";

const ETAPA_A = "00000000-0000-4000-8000-0000000000a1";
const ETAPA_B = "00000000-0000-4000-8000-0000000000b2";
const ANA = "00000000-0000-4000-8000-00000000000a";
const AGORA = new Date("2026-10-19T15:00:00Z");

const pipeline = {
  id: "00000000-0000-4000-8000-0000000000ff",
  stages: [
    { id: ETAPA_A, name: "Qualificação", color: "#00A3FF", position: 0, staleAfterDays: 7, dealCount: 0 },
    { id: ETAPA_B, name: "Proposta", color: "#7C5CFF", position: 1, staleAfterDays: null, dealCount: 0 },
  ],
} as unknown as Pipeline;

function negocio(parcial: Partial<Deal> & { id: string }): Deal {
  return {
    pipelineId: pipeline.id,
    companyId: "waze",
    stageId: ETAPA_A,
    status: "open",
    title: "Negócio",
    value: null,
    expectedCloseDate: null,
    client: { id: "00000000-0000-4000-8000-0000000000c1", name: "Logística Igarapé", personType: "pj" },
    contact: null,
    owner: { id: ANA, name: "Ana" },
    tags: [],
    consumerUnits: [],
    stageEnteredAt: "2026-10-18T15:00:00Z",
    closedAt: null,
    lossReason: null,
    revisitOn: null,
    createdAt: "2026-10-01T15:00:00Z",
    ...parcial,
  };
}

describe("dias na etapa e alerta de parado", () => {
  it("conta dias inteiros desde a entrada na etapa", () => {
    assert.equal(diasNaEtapa(negocio({ id: "1", stageEnteredAt: "2026-10-10T15:00:00Z" }), AGORA), 9);
  });

  it("parado é aberto e além do prazo da etapa; etapa sem prazo nunca alerta", () => {
    assert.equal(estaParado(negocio({ id: "1", stageEnteredAt: "2026-10-10T15:00:00Z" }), pipeline, AGORA), true);
    assert.equal(estaParado(negocio({ id: "2", stageEnteredAt: "2026-10-15T15:00:00Z" }), pipeline, AGORA), false);
    assert.equal(estaParado(negocio({ id: "3", stageId: ETAPA_B, stageEnteredAt: "2026-01-01T15:00:00Z" }), pipeline, AGORA), false);
    assert.equal(estaParado(negocio({ id: "4", status: "won", stageEnteredAt: "2026-10-01T15:00:00Z" }), pipeline, AGORA), false);
  });
});

describe("valores", () => {
  it("soma e resume no topo da coluna", () => {
    assert.equal(somaDosValores([negocio({ id: "1", value: "620000.00" }), negocio({ id: "2", value: null }), negocio({ id: "3", value: "38000.50" })]), 658000.5);
    assert.equal(valorCurto(3_280_000), "R$ 3,28 mi");
    assert.equal(valorCurto(658_000), "R$ 658 mil");
    assert.equal(valorCurto(950), "R$ 950");
  });

  it("lê o valor como a pessoa digita", () => {
    assert.equal(valorDigitadoParaDecimal("480.000,00"), "480000.00");
    assert.equal(valorDigitadoParaDecimal("R$ 1.250,5"), "1250.50");
    assert.equal(valorDigitadoParaDecimal("480000"), "480000.00");
    assert.equal(valorDigitadoParaDecimal("480.000"), "480000.00");
    assert.equal(valorDigitadoParaDecimal(""), null);
    assert.equal(valorDigitadoParaDecimal("quatrocentos"), undefined);
  });
});

describe("filtros e ordenação da lista", () => {
  const lista = [
    negocio({ id: "1", title: "Galpão logístico", value: "620000.00", expectedCloseDate: "2026-10-05" }),
    negocio({ id: "2", title: "Clínica", value: "190000.00", status: "lost", stageId: ETAPA_B }),
    negocio({ id: "3", title: "Hotel Mirante", owner: { id: "00000000-0000-4000-8000-00000000000b", name: "Bruno" }, expectedCloseDate: "2026-11-20" }),
  ];

  it("por padrão mostra os abertos; busca ignora acentos e maiúsculas", () => {
    assert.deepEqual(aplicarFiltros(lista, FILTROS_INICIAIS, "2026-10-19").map((n) => n.id), ["1", "3"]);
    assert.deepEqual(aplicarFiltros(lista, { ...FILTROS_INICIAIS, busca: "galpao" }, "2026-10-19").map((n) => n.id), ["1"]);
    assert.deepEqual(aplicarFiltros(lista, { ...FILTROS_INICIAIS, status: "lost" }, "2026-10-19").map((n) => n.id), ["2"]);
  });

  it("filtra por responsável e por previsão", () => {
    assert.deepEqual(aplicarFiltros(lista, { ...FILTROS_INICIAIS, responsavel: ANA }, "2026-10-19").map((n) => n.id), ["1"]);
    assert.deepEqual(aplicarFiltros(lista, { ...FILTROS_INICIAIS, previsao: "atrasada" }, "2026-10-19").map((n) => n.id), ["1"]);
    assert.deepEqual(aplicarFiltros(lista, { ...FILTROS_INICIAIS, previsao: "proximo-mes" }, "2026-10-19").map((n) => n.id), ["3"]);
    assert.deepEqual(aplicarFiltros(lista, { ...FILTROS_INICIAIS, previsao: "sem-previsao", status: "todos" }, "2026-10-19").map((n) => n.id), ["2"]);
  });

  it("ordena por valor e por etapa", () => {
    assert.deepEqual(ordenar(lista, { campo: "valor", direcao: "desc" }, pipeline, AGORA).map((n) => n.id), ["1", "2", "3"]);
    assert.deepEqual(ordenar(lista, { campo: "etapa", direcao: "desc" }, pipeline, AGORA)[0]?.id, "2");
  });
});

describe("endereço e data", () => {
  it("o link guarda pipeline e visão", () => {
    assert.equal(hrefDaVisao("abc", "lista"), "/comercial/pipelines?pipeline=abc&visao=lista");
    assert.equal(hrefDaVisao("abc", "calendario"), "/comercial/pipelines?pipeline=abc&visao=calendario");
    assert.equal(hrefDaVisao("abc", "kanban"), "/comercial/pipelines?pipeline=abc");
  });

  it("hoje é contado em Manaus", () => {
    assert.equal(hojeNoFuso(new Date("2026-10-20T02:00:00Z")), "2026-10-19");
  });
});

describe("calendário de previsões", () => {
  it("navega entre meses atravessando o ano", () => {
    assert.equal(mesRelativo("2026-12", 1), "2027-01");
    assert.equal(mesRelativo("2026-01", -1), "2025-12");
  });

  it("alinha as semanas de segunda a domingo e inclui o dia bissexto", () => {
    const { dias } = montarCalendario([], "2024-02");
    assert.equal(dias[0]?.data, "2024-01-29");
    assert.equal(dias.at(-1)?.data, "2024-03-03");
    assert.equal(dias.filter((dia) => dia.noMes).length, 29);
    assert.equal(dias.length % 7, 0);
  });

  it("agrupa pela data de calendário sem deslocar o dia e preserva os negócios sem previsão", () => {
    const negocios = [
      negocio({ id: "1", expectedCloseDate: "2026-10-01" }),
      negocio({ id: "2", expectedCloseDate: "2026-10-01" }),
      negocio({ id: "3", expectedCloseDate: "2026-11-01" }),
      negocio({ id: "4", expectedCloseDate: null }),
    ];
    const calendario = montarCalendario(negocios, "2026-10");
    assert.deepEqual(calendario.dias.find((dia) => dia.data === "2026-10-01")?.negocios.map((n) => n.id), ["1", "2"]);
    assert.deepEqual(calendario.semPrevisao.map((n) => n.id), ["4"]);
    assert.equal(calendario.totalNoMes, 2);
    assert.deepEqual(calendario.dias.flatMap((dia) => dia.negocios.map((n) => n.id)), ["1", "2"]);
    assert.equal(montarCalendario(negocios, "2026-11").totalNoMes, 1);
    assert.deepEqual(negocios.map((n) => n.id), ["1", "2", "3", "4"]);
  });

  it("mantém seis semanas nos meses que precisam delas e aceita mês sem negócios", () => {
    const calendario = montarCalendario([], "2026-03");
    assert.equal(calendario.dias.length, 42);
    assert.equal(calendario.totalNoMes, 0);
    assert.deepEqual(calendario.semPrevisao, []);
  });
});
