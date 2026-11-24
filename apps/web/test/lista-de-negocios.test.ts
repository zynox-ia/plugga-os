import assert from "node:assert/strict";
import { it } from "node:test";

import type { Deal, Pipeline } from "@plugga/shared";
import { camposPersonalizadosNaLista, csvNegocios, dataDeFechamentoExibida, diasEmAtrasoDoFechamento, diasParaFechamento, filtrarNegociosLista, ordenarNegociosLista, valorPonderadoDoNegocio } from "../app/lib/negocios/lista-de-negocios.ts";

const deal = (id: string, overrides: Partial<Deal> = {}) => ({
  id, number: Number(id), pipelineId: "p", companyId: "c", stageId: "a", status: "open", priority: null,
  title: `Negócio ${id}`, value: "1000.00", expectedCloseDate: null,
  lead: { name: `Cliente ${id}`, mainInterest: id === "1" ? "Prospecção" : null, companyName: null }, client: null, contact: null,
  owner: { id: id === "1" ? "ana" : "bia", name: id === "1" ? "Ana" : "Bia" }, tags: [], stageEnteredAt: "2026-11-01T12:00:00.000Z",
  closedAt: null, lossReason: null, revisitOn: null, createdAt: "2026-11-01T12:00:00.000Z", ...overrides,
}) as Deal;
const pipeline = { stages: [
  { id: "a", name: "Prospecção", color: "var(--ui-primary)", position: 0, staleAfterDays: 7 },
  { id: "b", name: "Proposta", color: "var(--ui-success)", position: 1, staleAfterDays: 4 },
] } as Pipeline;
const dados = [deal("1"), deal("2", { stageId: "b", status: "won", title: "Proposta especial", value: "2000.00" })];

it("filtra situação, pessoa, risco e busca sem distinção de acentos", () => {
  assert.deepEqual(filtrarNegociosLista(dados, { busca: "prospeccao", responsavel: "", situacao: "all", emRisco: false }, pipeline).map((n) => n.id), ["1"]);
  assert.deepEqual(filtrarNegociosLista(dados, { busca: "", responsavel: "bia", situacao: "won", emRisco: false }, pipeline).map((n) => n.id), ["2"]);
  assert.deepEqual(filtrarNegociosLista(dados, { busca: "", responsavel: "", situacao: "all", emRisco: true }, pipeline, new Date("2026-11-20T12:00:00Z")).map((n) => n.id), ["1"]);
});

it("ordena e pondera conforme a posição da etapa", () => {
  assert.deepEqual(ordenarNegociosLista(dados, { campo: "valor", direcao: "desc" }, pipeline).map((n) => n.id), ["2", "1"]);
  assert.equal(valorPonderadoDoNegocio(dados[0]!, pipeline), 333.3333333333333);
  assert.equal(valorPonderadoDoNegocio(dados[1]!, pipeline), 1333.3333333333333);
});

it("calcula dias de fechamento como datas civis, sem deslocamento de fuso", () => {
  assert.equal(diasParaFechamento("2026-12-01", "2026-11-19"), 12);
  assert.equal(diasParaFechamento("2026-11-18", "2026-11-19"), -1);
});

it("sinaliza atraso só para negócios abertos", () => {
  const hoje = "2026-11-19";
  assert.equal(diasEmAtrasoDoFechamento(deal("1", { expectedCloseDate: "2026-11-18" }), hoje), 1);
  assert.equal(diasEmAtrasoDoFechamento(deal("2", { status: "won", expectedCloseDate: "2026-11-18" }), hoje), null);
  assert.equal(diasEmAtrasoDoFechamento(deal("3", { status: "lost", expectedCloseDate: "2026-11-18" }), hoje), null);
});

it("mostra a data real de encerramento sem exigir previsão", () => {
  assert.equal(dataDeFechamentoExibida(deal("4", { status: "won", expectedCloseDate: null, closedAt: "2026-11-18" })), "2026-11-18");
  assert.equal(dataDeFechamentoExibida(deal("5", { status: "open", expectedCloseDate: null, closedAt: null })), null);
});

it("ordena encerrados pela mesma data efetiva mostrada na coluna", () => {
  const encerrados = [
    deal("6", { status: "won", expectedCloseDate: null, closedAt: "2026-11-18" }),
    deal("7", { status: "won", expectedCloseDate: "2026-11-10", closedAt: null }),
  ];
  assert.deepEqual(ordenarNegociosLista(encerrados, { campo: "fechamento", direcao: "asc" }, pipeline).map((negocio) => negocio.id), ["7", "6"]);
});

it("inclui somente campos de pipeline showInList com valor preenchido", () => {
  const pipelineComCampos = {
    ...pipeline,
    fields: [
      { id: "area", name: "Área", type: "number", options: [], showOnCard: false, showInList: true, position: 0, valueCount: 1 },
      { id: "ativo", name: "Ativo", type: "boolean", options: [], showOnCard: false, showInList: true, position: 1, valueCount: 1 },
      { id: "oculto", name: "Privado", type: "text", options: [], showOnCard: false, showInList: false, position: 2, valueCount: 1 },
      { id: "vazio", name: "Em branco", type: "text", options: [], showOnCard: false, showInList: true, position: 3, valueCount: 0 },
    ],
  } as Pipeline;
  const negocio = deal("4", { customFields: { area: "0", ativo: false, oculto: "segredo", vazio: "" } });
  assert.deepEqual(camposPersonalizadosNaLista(negocio, pipelineComCampos), ["Área: 0", "Ativo: Não"]);
});

it("exporta CSV escapando aspas e incluindo apenas as linhas recebidas", () => {
  const csv = csvNegocios([deal("3", { title: 'Projeto "Solar"', lead: { name: "Cliente 3", mainInterest: null, companyName: "=HYPERLINK(\"https://example.com\")" } as Deal["lead"] })], pipeline);
  assert.match(csv, /PLU-0003/);
  assert.match(csv, /"Projeto ""Solar"""/);
  assert.match(csv, /'=?HYPERLINK/);
  assert.match(csv, /Entrada na etapa/);
  assert.doesNotMatch(csv, /Último contato/);
  assert.doesNotMatch(csv, /PLU-0001/);
});
