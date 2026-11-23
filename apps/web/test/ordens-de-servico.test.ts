import assert from "node:assert/strict";
import { test } from "node:test";

import type { ContagensDasColunas } from "@plugga/shared";

import {
  agendaDaOrdem,
  consultaDaLista,
  consultaDoQuadro,
  contagemDoFiltro,
  diaDaAgenda,
  filtrosAtivosNasOrdens,
  hrefDasOrdens,
  horarioEmManaus,
  lerFiltrosDasOrdens,
  temFiltroNasOrdens,
  textoDoAtraso,
  eventosPorDia,
  HORARIOS_DE_AGENDAMENTO,
  passoNaTrilha,
  pendenciasDaOrdem,
  prazoDaOrdem,
  problemasDoAdiamento,
  problemasDoAgendamento,
  quandoNaFicha,
  urlDoArquivoDaOrdem,
} from "../app/lib/ordens-de-servico.ts";

const TECNICO = "3f1c1d2e-8a4b-4c5d-9e6f-0a1b2c3d4e5f";

test("lê os filtros do endereço e ignora valores desconhecidos", () => {
  assert.deepEqual(lerFiltrosDasOrdens({}), { visao: "cards", busca: undefined });
  assert.deepEqual(
    lerFiltrosDasOrdens({ visao: "quadro", busca: "  OS-0012 ", situacao: "atrasadas", tipo: "limpeza", tecnico: TECNICO, empresa: "waze" }),
    { visao: "quadro", busca: "OS-0012", situacao: "atrasadas", tipo: "limpeza", tecnicoId: TECNICO, empresa: "waze" },
  );
  assert.deepEqual(lerFiltrosDasOrdens({ visao: "x", situacao: "qualquer", tipo: "obra", tecnico: "igor", empresa: "outra" }), { visao: "cards", busca: undefined });
});

test("o endereço guarda visão, filtros e a ficha; o quadro não leva a situação", () => {
  assert.equal(hrefDasOrdens({ visao: "cards" }), "/engenharia/ordens-de-servico");
  assert.equal(hrefDasOrdens({ visao: "lista", situacao: "aberta", empresa: "plugga" }, "abc"), "/engenharia/ordens-de-servico?visao=lista&situacao=aberta&empresa=plugga&os=abc");
  assert.equal(hrefDasOrdens({ visao: "quadro", situacao: "aberta", tecnicoId: TECNICO }), `/engenharia/ordens-de-servico?visao=quadro&tecnico=${TECNICO}`);
  // Ida e volta: o que se escreve se lê igual.
  const filtros = lerFiltrosDasOrdens(Object.fromEntries(new URL(`http://x${hrefDasOrdens({ visao: "lista", busca: "Fazenda", situacao: "em_andamento", tipo: "garantia" })}`).searchParams));
  assert.deepEqual(filtros, { visao: "lista", busca: "Fazenda", situacao: "em_andamento", tipo: "garantia" });
});

test("o filtro Situação vira grupo, situação ou atenção na consulta da API", () => {
  const base = { visao: "lista" } as const;
  assert.deepEqual(consultaDaLista({ ...base, situacao: "em_andamento" }), { empresa: undefined, tipo: undefined, tecnicoId: undefined, busca: undefined, grupo: "em_andamento", situacao: undefined, atencao: undefined });
  assert.equal(consultaDaLista({ ...base, situacao: "laudo" }).situacao, "laudo");
  assert.equal(consultaDaLista({ ...base, situacao: "em_campo_hoje" }).atencao, "em_campo_hoje");
  assert.equal(consultaDaLista({ ...base, situacao: "em_campo_hoje" }).situacao, undefined);
  assert.deepEqual(consultaDoQuadro({ visao: "quadro", situacao: "aberta", empresa: "waze" }), { empresa: "waze", tipo: undefined, tecnicoId: undefined, busca: undefined });
});

test("Limpar e o selo de filtros contam só o que vale na visão", () => {
  assert.equal(temFiltroNasOrdens({ visao: "cards" }), false);
  assert.equal(temFiltroNasOrdens({ visao: "cards", situacao: "aberta" }), true);
  assert.equal(temFiltroNasOrdens({ visao: "quadro", situacao: "aberta" }), false);
  assert.equal(filtrosAtivosNasOrdens({ visao: "lista", busca: "x", situacao: "aberta", empresa: "waze" }), 3);
  assert.equal(filtrosAtivosNasOrdens({ visao: "quadro", situacao: "aberta", empresa: "waze" }), 1);
});

test("as contagens do filtro somam as colunas certas", () => {
  const c: ContagensDasColunas = { para_agendar: 3, agendadas: 6, em_campo: 1, colher_assinatura: 1, concluidas: 2, adiadas: 1, canceladas: 4, atrasadas: 2, em_campo_hoje: 2 };
  assert.equal(contagemDoFiltro("em_andamento", c), 12);
  assert.equal(contagemDoFiltro("todas", c), 18);
  assert.equal(contagemDoFiltro("laudo", c), 1);
  assert.equal(contagemDoFiltro("atrasadas", c), 2);
});

test("dia da agenda: Hoje, Amanhã, dia da semana na semana e dia curto fora dela", () => {
  const hoje = "2026-11-23"; // segunda
  assert.equal(diaDaAgenda("2026-11-23", hoje), "Hoje");
  assert.equal(diaDaAgenda("2026-11-24", hoje), "Amanhã");
  assert.equal(diaDaAgenda("2026-11-25", hoje), "qua 25 nov");
  assert.equal(diaDaAgenda("2026-12-02", hoje), "2 dez");
  assert.equal(diaDaAgenda("2026-11-20", hoje), "20 nov");
});

test("horário e atraso no relógio de Manaus", () => {
  assert.equal(horarioEmManaus("2026-11-23T12:00:00.000Z"), "08:00");
  // 02:30 UTC do dia 24 ainda é 22:30 do dia 23 em Manaus.
  assert.equal(horarioEmManaus("2026-11-24T02:30:00.000Z"), "22:30");
  assert.equal(textoDoAtraso("2026-11-21", "2026-11-23"), "atrasada há 2 dias");
  assert.equal(textoDoAtraso("2026-11-22", "2026-11-23"), "atrasada há 1 dia");
  assert.equal(textoDoAtraso("2026-11-23", "2026-11-23"), "atrasada");
});

test("agenda da O.S. em duas linhas, como nos cards", () => {
  const hoje = "2026-11-23";
  assert.deepEqual(agendaDaOrdem({ situacao: "agendada", agendadaPara: "2026-11-23T12:00:00.000Z", prazo: "2026-11-30", atrasada: false }, hoje), { dia: "Hoje", detalhe: "08:00", tom: null });
  assert.deepEqual(agendaDaOrdem({ situacao: "agendada", agendadaPara: "2026-11-20T13:00:00.000Z", prazo: "2026-11-30", atrasada: true }, hoje), { dia: "20 nov", detalhe: "atrasada há 3 dias", tom: "atraso" });
  assert.deepEqual(agendaDaOrdem({ situacao: "adiada", agendadaPara: null, novaData: "2026-11-30", prazo: "2026-12-05", atrasada: false }, hoje), { dia: "30 nov", detalhe: "nova data", tom: "aviso" });
  assert.deepEqual(agendaDaOrdem({ situacao: "aberta", agendadaPara: null, prazo: "2026-12-02", atrasada: false }, hoje), { dia: "Sem data", detalhe: "prazo 2 dez", tom: null });
  assert.deepEqual(agendaDaOrdem({ situacao: "aberta", agendadaPara: null, prazo: "2026-11-21", atrasada: true }, hoje), { dia: "Sem data", detalhe: "prazo 21 nov · atrasada há 2 dias", tom: "atraso" });
  // O dia agendado de Manaus, mesmo quando o UTC já virou.
  assert.equal(agendaDaOrdem({ situacao: "agendada", agendadaPara: "2026-11-24T02:30:00.000Z", prazo: "2026-11-30", atrasada: false }, hoje).dia, "Hoje");
});

test("passo na trilha: adiada volta para Agendada, cancelada fica onde parou", () => {
  assert.equal(passoNaTrilha("aberta"), 0);
  assert.equal(passoNaTrilha("laudo"), 3);
  assert.equal(passoNaTrilha("concluida"), 4);
  assert.equal(passoNaTrilha("adiada"), 1);
  assert.equal(passoNaTrilha("cancelada", "em_campo"), 2);
  assert.equal(passoNaTrilha("cancelada", null), 0);
});

test("o que falta para avançar segue a etapa", () => {
  const base = { descricao: "Limpeza", tecnico: { id: "x" }, agendadaPara: "2026-11-23T12:00:00.000Z", checkinEm: "2026-11-23T12:05:00.000Z", fotos: [], laudo: null, termo: null };
  assert.deepEqual(pendenciasDaOrdem({ ...base, situacao: "em_campo" }), [{ feito: true, texto: "Check-in no local" }, { feito: false, texto: "Evidências" }, { feito: false, texto: "Laudo" }]);
  assert.deepEqual(pendenciasDaOrdem({ ...base, situacao: "laudo", fotos: [1, 2, 3, 4], laudo: {} }).map((p) => [p.feito, p.texto]), [[true, "Laudo"], [true, "Evidências (4)"], [false, "Termo assinado pelo cliente"]]);
  assert.deepEqual(pendenciasDaOrdem({ ...base, situacao: "concluida" }), []);
});

test("prazo da ficha: hoje, em N dias ou atrasada", () => {
  const hoje = "2026-11-23";
  assert.deepEqual(prazoDaOrdem({ prazo: "2026-11-23", atrasada: false }, hoje), { texto: "Prazo hoje", tom: "hoje" });
  assert.deepEqual(prazoDaOrdem({ prazo: "2026-11-24", atrasada: false }, hoje), { texto: "Prazo em 1 dia", tom: "ok" });
  assert.deepEqual(prazoDaOrdem({ prazo: "2026-11-21", atrasada: true }, hoje), { texto: "Atrasada há 2 dias", tom: "vencido" });
  // Atrasada no próprio dia (o horário agendado passou).
  assert.deepEqual(prazoDaOrdem({ prazo: "2026-11-23", atrasada: true }, hoje), { texto: "Atrasada", tom: "vencido" });
});

test("agendar: técnico, data e horário obrigatórios, nada no passado", () => {
  const hoje = "2026-11-23";
  assert.deepEqual(problemasDoAgendamento({ tecnicoId: "", data: "", horario: "" }, hoje, "10:00"), { tecnicoId: "escolha o técnico.", data: "informe a data (dd/mm/aaaa).", horario: "escolha o horário." });
  assert.equal(problemasDoAgendamento({ tecnicoId: "t", data: "2026-11-22", horario: "08:00" }, hoje, "10:00").data, "a data não pode estar no passado.");
  assert.equal(problemasDoAgendamento({ tecnicoId: "t", data: hoje, horario: "09:30" }, hoje, "10:00").horario, "o horário de hoje já passou.");
  assert.deepEqual(problemasDoAgendamento({ tecnicoId: "t", data: hoje, horario: "10:30" }, hoje, "10:00"), { tecnicoId: undefined, data: undefined, horario: undefined });
  assert.equal(HORARIOS_DE_AGENDAMENTO[0], "06:00");
  assert.equal(HORARIOS_DE_AGENDAMENTO.at(-1), "20:00");
});

test("adiar: motivo e nova data depois de hoje", () => {
  const hoje = "2026-11-23";
  assert.deepEqual(problemasDoAdiamento({ motivo: " ", novaData: hoje }, hoje), { motivo: "informe o motivo do adiamento.", novaData: "a nova data precisa ser depois de hoje." });
  assert.deepEqual(problemasDoAdiamento({ motivo: "chuva", novaData: "2026-11-24" }, hoje), { motivo: undefined, novaData: undefined });
});

test("linha do tempo agrupada pelo dia de Manaus, do mais novo ao mais antigo", () => {
  const hoje = "2026-11-23";
  const eventos = [
    { id: "a", em: "2026-11-21T14:00:00.000Z" },
    { id: "b", em: "2026-11-23T13:00:00.000Z" },
    // 02:00 UTC do dia 24 ainda é dia 23 em Manaus.
    { id: "c", em: "2026-11-24T02:00:00.000Z" },
    { id: "d", em: "2026-11-22T12:00:00.000Z" },
  ];
  assert.deepEqual(eventosPorDia(eventos, hoje).map((g) => [g.rotulo, g.itens.map((e) => e.id)]), [["Hoje", ["c", "b"]], ["Ontem", ["d"]], ["sáb 21 nov", ["a"]]]);
});

test("quando na ficha e o caminho do arquivo pelo proxy", () => {
  const hoje = "2026-11-23";
  assert.equal(quandoNaFicha("2026-11-23T12:00:00.000Z", hoje), "hoje, 08:00");
  assert.equal(quandoNaFicha("2026-11-20T12:30:00.000Z", hoje), "20 nov, 08:30");
  assert.equal(quandoNaFicha(null, hoje), "Sem data");
  assert.equal(urlDoArquivoDaOrdem("/engenharia/ordens-de-servico/x/arquivos/y"), "/api/engenharia/ordens-de-servico/x/arquivos/y");
});
