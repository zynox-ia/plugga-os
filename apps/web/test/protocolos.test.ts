import assert from "node:assert/strict";
import { test } from "node:test";

import type { ProtocoloResumo } from "@plugga/shared";

import {
  consultaDosProtocolos,
  contagemDoFiltroDosProtocolos,
  corpoDaVerificacao,
  hrefDosProtocolos,
  lerFiltrosDosProtocolos,
  passoDoProtocolo,
  prazoDoProtocolo,
  problemasDaVerificacao,
  problemasDoNovoProtocolo,
  rotuloDoDesfecho,
  somarDias,
  soVencendo,
  temFiltroNosProtocolos,
  textoDaVerificacao,
  type NovoProtocolo,
} from "../app/lib/protocolos.ts";

const P1 = "3f1c1d2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f";
const HOJE = "2026-11-23";

test("filtros pelo endereço: só valores conhecidos; a ficha vai em ?protocolo=", () => {
  assert.deepEqual(lerFiltrosDosProtocolos({ situacao: "vencendo", empresa: "waze", departamento: "energia-opm", distribuidora: "amazonas-energia", busca: "  2026.11 " }),
    { situacao: "vencendo", empresa: "waze", departamento: "energia-opm", distribuidoraId: "amazonas-energia", busca: "2026.11" });
  assert.deepEqual(lerFiltrosDosProtocolos({ situacao: "qualquer", empresa: "x", departamento: "financeiro", distribuidora: "../x" }), {});
  assert.equal(hrefDosProtocolos({}), "/engenharia/protocolos");
  assert.equal(hrefDosProtocolos({ situacao: "verificar_hoje", empresa: "plugga" }, P1), `/engenharia/protocolos?situacao=verificar_hoje&empresa=plugga&protocolo=${P1}`);
  assert.equal(temFiltroNosProtocolos({ empresa: "waze" }), false);
  assert.equal(temFiltroNosProtocolos({ busca: "x" }), true);
});

test("consulta da API: grupo, verificar hoje ou a situação; vencendo pede os em andamento", () => {
  assert.equal(consultaDosProtocolos({ situacao: "em_andamento" }).grupo, "em_andamento");
  assert.equal(consultaDosProtocolos({ situacao: "vencendo" }).grupo, "em_andamento");
  assert.equal(consultaDosProtocolos({ situacao: "verificar_hoje" }).verificarHoje, "sim");
  assert.equal(consultaDosProtocolos({ situacao: "com_pendencia" }).situacao, "com_pendencia");
  assert.deepEqual(consultaDosProtocolos({ empresa: "waze", distribuidoraId: "d1" }), { departamento: undefined, distribuidoraId: "d1", empresa: "waze", busca: undefined });
  const c = { emAndamento: 5, verificarHoje: 2, vencemEm7Dias: 3, vencidos: 1 };
  assert.equal(contagemDoFiltroDosProtocolos("vencendo", c), 3);
  assert.equal(contagemDoFiltroDosProtocolos("aberto", c), null);
});

const resumo = (p: Partial<ProtocoloResumo>): ProtocoloResumo => ({
  id: P1, empresa: "waze", departamento: "engenharia-obras", tipo: "liberacao", numero: "2026.11.000001", situacao: "em_analise",
  cliente: { id: P1, nome: "Cliente (sintético)" }, uc: { id: P1, codigo: "9999001" }, distribuidora: { id: "d1", nome: "Distribuidora (sintética)" },
  abertoEm: "2026-11-01", dataLimite: "2026-11-30", diasParaOLimite: 7, proximaVerificacao: "2026-11-25", verificarHoje: false, acaoPendente: null, ultimaVerificacao: null, ...p,
});

test("data-limite e verificação nos cards", () => {
  assert.deepEqual(prazoDoProtocolo(resumo({ diasParaOLimite: -2 })), { texto: "venceu há 2 dias", tom: "perigo" });
  assert.deepEqual(prazoDoProtocolo(resumo({ diasParaOLimite: 0 })), { texto: "vence hoje", tom: "alerta" });
  assert.deepEqual(prazoDoProtocolo(resumo({ diasParaOLimite: 1 })), { texto: "vence em 1 dia", tom: "alerta" });
  assert.deepEqual(prazoDoProtocolo(resumo({ diasParaOLimite: 9 })), { texto: "vence em 9 dias", tom: null });
  assert.deepEqual(prazoDoProtocolo(resumo({ situacao: "liberado", diasParaOLimite: null })), { texto: "liberado", tom: null });
  assert.equal(textoDaVerificacao(resumo({ verificarHoje: true }), HOJE), "verificar hoje");
  assert.equal(textoDaVerificacao(resumo({ proximaVerificacao: "2026-11-24" }), HOJE), "verificar amanhã");
  assert.equal(textoDaVerificacao(resumo({ proximaVerificacao: "2026-11-26" }), HOJE), "verificar qui 26 nov");
  assert.equal(textoDaVerificacao(resumo({ situacao: "indeferido" }), HOJE), "encerrado");
  assert.deepEqual(soVencendo([resumo({ diasParaOLimite: 8 }), resumo({ diasParaOLimite: 7 }), resumo({ diasParaOLimite: 0 }), resumo({ diasParaOLimite: -1 }), resumo({ situacao: "respondido", diasParaOLimite: null })]).map((p) => p.diasParaOLimite), [7, 0]);
});

test("trilha: pendência fica em análise; o desfecho leva o nome do resultado", () => {
  assert.equal(passoDoProtocolo("aberto"), 0);
  assert.equal(passoDoProtocolo("com_pendencia"), 1);
  assert.equal(passoDoProtocolo("indeferido"), 2);
  assert.equal(rotuloDoDesfecho("em_analise"), "Respondido");
  assert.equal(rotuloDoDesfecho("liberado"), "Liberado");
  assert.equal(somarDias("2026-11-30", 3), "2026-12-03");
});

const novo = (p: Partial<NovoProtocolo>): NovoProtocolo => ({
  empresa: "waze", departamento: "engenharia-obras", tipo: "liberacao", clienteId: P1, ucId: P1, distribuidoraId: "d1",
  numero: "2026.11.000001", abertoEm: HOJE, dataLimite: "2026-12-10", proximaVerificacao: "2026-11-26", observacao: "", ...p,
});

test("novo protocolo: obrigatórios, abertura não no futuro, limite e verificação não no passado", () => {
  assert.deepEqual(problemasDoNovoProtocolo(novo({}), HOJE), {});
  const e = problemasDoNovoProtocolo(novo({ tipo: "", clienteId: "", numero: " ", abertoEm: "2026-11-24", dataLimite: "2026-11-22", proximaVerificacao: "2026-11-20" }), HOJE);
  assert.deepEqual(Object.keys(e).sort(), ["abertoEm", "clienteId", "dataLimite", "numero", "proximaVerificacao", "tipo"]);
  assert.equal(problemasDoNovoProtocolo(novo({ ucId: "" }), HOJE).ucId, "escolha a UC.");
  assert.equal(problemasDoNovoProtocolo(novo({ abertoEm: "2026-11-20", dataLimite: HOJE }), HOJE).dataLimite, undefined);
  assert.equal(problemasDoNovoProtocolo(novo({ proximaVerificacao: "" }), HOJE).proximaVerificacao, undefined);
});

test("verificação: pendência pede a ação; encerrar dispensa a próxima", () => {
  const base = { nota: "", acaoPendente: "", proximaVerificacao: "2026-11-26" };
  assert.deepEqual(problemasDaVerificacao({ situacao: "em_analise", ...base }, HOJE), {});
  assert.equal(problemasDaVerificacao({ situacao: "com_pendencia", ...base }, HOJE).acaoPendente, "diga o que precisa ser feito.");
  assert.equal(problemasDaVerificacao({ situacao: "em_analise", ...base, proximaVerificacao: "" }, HOJE).proximaVerificacao, "marque a próxima verificação.");
  assert.equal(problemasDaVerificacao({ situacao: "em_analise", ...base, proximaVerificacao: "2026-11-22" }, HOJE).proximaVerificacao, "a verificação não pode estar no passado.");
  assert.deepEqual(problemasDaVerificacao({ situacao: "liberado", ...base, proximaVerificacao: "" }, HOJE), {});
  assert.deepEqual(corpoDaVerificacao({ situacao: "liberado", nota: " ok ", acaoPendente: "x", proximaVerificacao: "2026-11-26" }), { situacao: "liberado", nota: "ok", acaoPendente: null, proximaVerificacao: null });
  assert.deepEqual(corpoDaVerificacao({ situacao: "com_pendencia", nota: "", acaoPendente: " enviar o diagrama ", proximaVerificacao: "2026-11-26" }), { situacao: "com_pendencia", nota: null, acaoPendente: "enviar o diagrama", proximaVerificacao: "2026-11-26" });
});
