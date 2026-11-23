import assert from "node:assert/strict";
import { test } from "node:test";

import {
  consultaDeTarefas,
  corpoDaNovaTarefa,
  diaCurtoDaTarefa,
  ehDepartamentoComTarefas,
  hrefDeTarefas,
  lerFiltrosDeTarefas,
  linhaDaOcorrencia,
  ordenarOcorrencias,
  prazoDaOcorrencia,
  previaDoRascunho,
  problemasDoConcluir,
  rascunhoVazio,
  regraDoRascunho,
  temFiltroNasTarefas,
  textoDoProgresso,
  urlDaEvidencia,
} from "../app/lib/tarefas.ts";

const PESSOA = "3f1c1d2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f";
const OUTRA = "4f1c1d2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f";
const HOJE = "2026-11-23"; // segunda

test("só os departamentos do contrato têm Tarefas", () => {
  assert.equal(ehDepartamentoComTarefas("engenharia-obras"), true);
  assert.equal(ehDepartamentoComTarefas("financeiro"), true);
  assert.equal(ehDepartamentoComTarefas("crm"), false);
  assert.equal(ehDepartamentoComTarefas("../auth"), false);
});

test("filtros pelo endereço: Lista e Hoje por padrão; ida e volta pelo href", () => {
  assert.deepEqual(lerFiltrosDeTarefas({}), { visao: "lista", periodo: "hoje" });
  assert.deepEqual(lerFiltrosDeTarefas({ visao: "x", periodo: "ontem", empresa: "ambas", responsavel: "joao" }), { visao: "lista", periodo: "hoje" });
  const f = lerFiltrosDeTarefas({ visao: "kanban", periodo: "semana", empresa: "waze", responsavel: PESSOA, categoria: " CCEE " });
  assert.deepEqual(f, { visao: "kanban", periodo: "semana", empresa: "waze", responsavelId: PESSOA, categoria: "CCEE" });
  const href = hrefDeTarefas("/engenharia/tarefas", f);
  assert.equal(href, `/engenharia/tarefas?visao=kanban&periodo=semana&categoria=CCEE&empresa=waze&responsavel=${PESSOA}`);
  assert.deepEqual(lerFiltrosDeTarefas(Object.fromEntries(new URL(`http://x${href}`).searchParams)), f);
  assert.equal(hrefDeTarefas("/financeiro/tarefas", { visao: "lista", periodo: "hoje" }), "/financeiro/tarefas");
  assert.deepEqual(consultaDeTarefas(f), { periodo: "semana", empresa: "waze", responsavelId: PESSOA, categoria: "CCEE" });
  assert.equal(temFiltroNasTarefas({ visao: "kanban", periodo: "hoje" }), false);
  assert.equal(temFiltroNasTarefas({ visao: "lista", periodo: "todas" }), true);
});

test("progresso do período", () => {
  assert.equal(textoDoProgresso("hoje", { concluidas: 1, total: 6 }), "1 de 6 concluídas hoje");
  assert.equal(textoDoProgresso("semana", { concluidas: 0, total: 1 }), "0 de 1 concluída nesta semana");
  assert.equal(textoDoProgresso("atrasadas", { concluidas: 0, total: 2 }), "2 tarefas atrasadas");
  assert.equal(textoDoProgresso("todas", { concluidas: 3, total: 9 }), "3 de 9 concluídas no total");
});

const base = {
  dia: HOJE, prazoEm: "2026-11-23T22:00:00.000Z", situacao: "no_prazo" as const, conclusao: null,
  recorrenciaTexto: "Todo dia útil, até 18:00", automacao: null, responsavel: { id: PESSOA, nome: "Marcus" },
};

test("prazo em duas linhas: até, atrasada há N dias ou feita às", () => {
  assert.equal(diaCurtoDaTarefa(HOJE, HOJE), "hoje");
  assert.equal(diaCurtoDaTarefa("2026-11-24", HOJE), "amanhã");
  assert.equal(diaCurtoDaTarefa("2026-11-20", HOJE), "sex 20/11");
  assert.deepEqual(prazoDaOcorrencia(base, HOJE), { dia: "hoje", detalhe: "até 18:00", tom: null });
  assert.deepEqual(prazoDaOcorrencia({ ...base, dia: "2026-11-20", prazoEm: "2026-11-20T21:00:00.000Z", situacao: "atrasada" }, HOJE), { dia: "sex 20/11", detalhe: "atrasada há 3 dias", tom: "perigo" });
  // Passou do horário de hoje: atrasada desde o horário.
  assert.deepEqual(prazoDaOcorrencia({ ...base, prazoEm: "2026-11-23T16:00:00.000Z", situacao: "atrasada" }, HOJE), { dia: "hoje", detalhe: "atrasada desde 12:00", tom: "perigo" });
  const conclusao = { por: null, em: "2026-11-23T13:40:00.000Z", resultado: "Semana planejada", evidencias: [], checklist: [], automatica: false };
  assert.deepEqual(prazoDaOcorrencia({ ...base, situacao: "concluida", conclusao }, HOJE), { dia: "hoje", detalhe: "feita às 09:40", tom: null });
});

test("segunda linha: recorrência na pendente, o que foi feito na concluída", () => {
  assert.equal(linhaDaOcorrencia(base), "Todo dia útil, até 18:00");
  assert.equal(linhaDaOcorrencia({ ...base, automacao: "engenharia.monitoramento_do_dia" }), "Todo dia útil, até 18:00 · conclui sozinha");
  const ev = { id: PESSOA, nome: "print.png", tamanhoBytes: 10, mime: "image/png", url: "/x", enviado: { por: null, em: "2026-11-23T13:00:00.000Z" } };
  assert.equal(linhaDaOcorrencia({ ...base, situacao: "concluida", conclusao: { por: null, em: "2026-11-23T13:40:00.000Z", resultado: "Sem pendências", evidencias: [ev], checklist: [], automatica: false } }), "Feita às 09:40 · print.png · Sem pendências");
  assert.equal(linhaDaOcorrencia({ ...base, situacao: "concluida", conclusao: { por: null, em: "2026-11-23T16:00:00.000Z", resultado: null, evidencias: [], checklist: [], automatica: true } }), "Concluída sozinha às 12:00");
});

test("ordem da lista: atrasadas, pendentes pelo prazo, concluídas no fim", () => {
  const o = (id: string, situacao: "no_prazo" | "atrasada" | "concluida", prazoEm: string) => ({ id, situacao, prazoEm, responsavel: { id: PESSOA, nome: "A" } });
  const ordem = ordenarOcorrencias([o("c", "concluida", "2026-11-23T10:00:00Z"), o("p2", "no_prazo", "2026-11-23T22:00:00Z"), o("a", "atrasada", "2026-11-20T22:00:00Z"), o("p1", "no_prazo", "2026-11-23T16:00:00Z")]);
  assert.deepEqual(ordem.map((x) => x.id), ["a", "p1", "p2", "c"]);
});

test("regra da recorrente e a prévia das próximas ocorrências (feriado conta como dia útil)", () => {
  assert.equal(regraDoRascunho({ recorrencia: "dias_da_semana", dias: [], diaDoMes: "" }), null);
  assert.deepEqual(regraDoRascunho({ recorrencia: "dias_da_semana", dias: [3, 1], diaDoMes: "" }), { recorrencia: "dias_da_semana", dias: [1, 3] });
  assert.equal(regraDoRascunho({ recorrencia: "mensal_dia", dias: [], diaDoMes: "29" }), null);
  assert.deepEqual(regraDoRascunho({ recorrencia: "mensal_dia", dias: [], diaDoMes: "5" }), { recorrencia: "mensal_dia", dia: 5 });
  const r = { ...rascunhoVazio(HOJE), tipo: "recorrente" as const, recorrencia: "dia_util" as const };
  // 25/12 é sexta e conta: sem calendário de feriados (decisão do André, E13).
  assert.deepEqual(previaDoRascunho({ ...r, inicio: "2026-12-24" }, HOJE), ["2026-12-24", "2026-12-25", "2026-12-28", "2026-12-29", "2026-12-30"]);
  assert.deepEqual(previaDoRascunho({ ...rascunhoVazio(HOJE), data: "2026-11-25" }, HOJE), ["2026-11-25"]);
  assert.deepEqual(previaDoRascunho({ ...rascunhoVazio(HOJE), data: "2026-11-20" }, HOJE), []);
});

test("Nova tarefa: confere e monta o corpo da única e da recorrente", () => {
  const vazio = corpoDaNovaTarefa({ ...rascunhoVazio(HOJE), exigeEvidencia: false, exigeResultado: false }, HOJE);
  assert.equal(vazio.corpo, null);
  assert.deepEqual(Object.keys(vazio.problemas).sort(), ["empresa", "exigeEvidencia", "responsavelId", "titulo"]);
  assert.equal(corpoDaNovaTarefa({ ...rascunhoVazio(HOJE), titulo: "x", empresa: "waze", responsavelId: PESSOA, substitutoId: PESSOA }, HOJE).problemas.substitutoId, "o substituto precisa ser outra pessoa.");

  const unica = corpoDaNovaTarefa({ ...rascunhoVazio(HOJE), titulo: " Enviar relatório ", empresa: "ambas", responsavelId: PESSOA, substitutoId: OUTRA, instrucoes: ["Exportar", " "], horarioLimite: "17:00", data: "2026-11-27" }, HOJE);
  assert.deepEqual(unica.corpo, { tipo: "unica", titulo: "Enviar relatório", empresa: "ambas", responsavelId: PESSOA, substitutoId: OUTRA, categoria: null, horarioLimite: "17:00", exigeEvidencia: true, exigeResultado: true, instrucoes: ["Exportar"], data: "2026-11-27" });

  const semDia = corpoDaNovaTarefa({ ...rascunhoVazio(HOJE), titulo: "x", empresa: "waze", responsavelId: PESSOA, tipo: "recorrente", recorrencia: "dias_da_semana" }, HOJE);
  assert.equal(semDia.problemas.dias, "escolha ao menos um dia.");
  const rec = corpoDaNovaTarefa({ ...rascunhoVazio(HOJE), titulo: "CCEE", empresa: "plugga", responsavelId: PESSOA, categoria: "CCEE", tipo: "recorrente", recorrencia: "mensal_primeiro_dia_util", inicio: "2026-12-01" }, HOJE);
  assert.equal(rec.corpo?.tipo, "recorrente");
  assert.deepEqual(rec.corpo && "regra" in rec.corpo ? rec.corpo.regra : null, { recorrencia: "mensal_primeiro_dia_util" });
  assert.equal(rec.corpo?.categoria, "CCEE");
  assert.equal(corpoDaNovaTarefa({ ...rascunhoVazio(HOJE), titulo: "x", empresa: "waze", responsavelId: PESSOA, data: "2026-11-22" }, HOJE).problemas.data, "a data não pode estar no passado.");
});

test("concluir pede o resultado e a evidência só quando a tarefa exige", () => {
  assert.deepEqual(problemasDoConcluir({ exigeEvidencia: true, exigeResultado: true }, " ", false), { resultado: "descreva o resultado.", evidencia: "anexe a evidência (PDF, JPG ou PNG)." });
  assert.deepEqual(problemasDoConcluir({ exigeEvidencia: false, exigeResultado: true }, "ok", false), {});
  assert.deepEqual(problemasDoConcluir({ exigeEvidencia: true, exigeResultado: false }, "", true), {});
  assert.equal(urlDaEvidencia("/tarefas/financeiro/ocorrencias/a/evidencias/b"), "/api/tarefas/financeiro/ocorrencias/a/evidencias/b");
});
