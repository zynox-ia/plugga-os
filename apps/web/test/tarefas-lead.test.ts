import assert from "node:assert/strict";
import { test } from "node:test";
import { moverTarefa, normalizarTarefa, validarTarefa, type DadosTarefa, type TarefaDoLead } from "../app/lib/tarefas-lead.ts";

const dados: DadosTarefa = { titulo: "Solicitar faturas", descricao: "Conferir os últimos três meses", responsavelId: "pessoa-1", dataInicio: "2028-02-29", dataFim: "2028-03-01", prioridade: "normal", status: "todo" };

test("tarefa exige título, responsável conhecido e uma data inicial válida", () => {
  const erros = validarTarefa({ ...dados, titulo: "   ", responsavelId: "desconhecido", dataInicio: "2026-02-29" }, ["pessoa-1"]);
  assert.ok(erros.titulo);
  assert.ok(erros.responsavelId);
  assert.ok(erros.dataInicio);
});

test("aceita ano bissexto e data final vazia, sem mudar dias pelo fuso", () => {
  assert.deepEqual(validarTarefa(dados, ["pessoa-1"]), {});
  assert.deepEqual(validarTarefa({ ...dados, dataFim: "" }, ["pessoa-1"]), {});
});

test("fim não pode ser impossível nem anterior ao início; mesmo dia é válido", () => {
  assert.ok(validarTarefa({ ...dados, dataFim: "2028-02-28" }, ["pessoa-1"]).dataFim);
  assert.ok(validarTarefa({ ...dados, dataFim: "2028-04-31" }, ["pessoa-1"]).dataFim);
  assert.deepEqual(validarTarefa({ ...dados, dataFim: dados.dataInicio }, ["pessoa-1"]), {});
});

test("limita título/descrição e remove espaços nas pontas sem alterar status ou entrada", () => {
  assert.ok(validarTarefa({ ...dados, titulo: "a".repeat(121), descricao: "a".repeat(2001) }, ["pessoa-1"]).titulo);
  assert.ok(validarTarefa({ ...dados, descricao: "a".repeat(2001) }, ["pessoa-1"]).descricao);
  const entrada = { ...dados, titulo: "  Fazer contato  ", descricao: "  Descrição  ", status: "doing" as const };
  assert.deepEqual(normalizarTarefa(entrada), { ...entrada, titulo: "Fazer contato", descricao: "Descrição" });
  assert.equal(entrada.titulo, "  Fazer contato  ");
});

test("movimentação altera só a tarefa escolhida e ignora colunas ou IDs inválidos", () => {
  const tarefas: TarefaDoLead[] = [{ ...dados, id: "a" }, { ...dados, id: "b", status: "done" }];
  const novas = moverTarefa(tarefas, "a", "doing");
  assert.equal(novas[0]!.status, "doing");
  assert.equal(novas[1]!.status, "done");
  assert.equal(tarefas[0]!.status, "todo");
  assert.deepEqual(moverTarefa(tarefas, "inexistente", "doing"), tarefas);
  assert.deepEqual(moverTarefa(tarefas, "a", "coluna-inválida"), tarefas);
});
