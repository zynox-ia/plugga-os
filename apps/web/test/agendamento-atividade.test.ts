import assert from "node:assert/strict";
import { test } from "node:test";
import { alteracoesDoAgendamento, horarioDeManaus, instanteEmManaus, validarHorarioDaAtividade } from "../app/lib/agendamento-atividade.ts";

test("agenda em Manaus preserva o horário mesmo na virada UTC", () => {
  assert.equal(instanteEmManaus("2026-11-09T23:30"), "2026-11-10T03:30:00.000Z");
  assert.equal(horarioDeManaus("2026-11-10T03:30:00.000Z"), "2026-11-09T23:30");
  assert.equal(horarioDeManaus("2026-11-10T00:15:00+02:00"), "2026-11-09T18:15");
});

test("recusa dias impossíveis e horário incompleto, sem normalizar silenciosamente", () => {
  for (const valor of ["2026-02-29T10:00", "2028-04-31T10:00", "2026-11-09T24:00", "2026-11-09T10:60", "2026-11-09", "", "2026-11-09T10:00Z"]) {
    assert.equal(instanteEmManaus(valor), null, valor);
  }
  assert.equal(instanteEmManaus("2028-02-29T00:00"), "2028-02-29T04:00:00.000Z");
});

test("prazo opcional usa o agendamento e prazo anterior é recusado", () => {
  assert.deepEqual(validarHorarioDaAtividade("2026-11-09T23:30", ""), {});
  assert.deepEqual(validarHorarioDaAtividade("2026-11-09T23:30", "2026-11-10T00:00"), {});
  assert.ok(validarHorarioDaAtividade("2026-11-09T23:30", "2026-11-09T23:29").dueAt);
  assert.ok(validarHorarioDaAtividade("2026-02-29T10:00", "").startsAt);
  assert.ok(validarHorarioDaAtividade("2026-11-09T10:00", "2026-11-09T24:00").dueAt);
});

test("editar notas de atividade do processo omite agenda protegida e não altera segundos de um agendamento manual", () => {
  const original = { title: "Conferir conta", notes: "", priority: "normal" as const, origin: "process" as const,
    currentRound: { ownerId: "pessoa", startsAt: "2026-11-09T14:00:37.000Z", dueAt: "2026-11-09T22:00:45.000Z" } };
  const dados = { type: "task" as const, title: original.title, notes: "Conta conferida.", priority: original.priority, ownerId: "pessoa", startsAt: "2026-11-09T14:00:00.000Z", dueAt: "2026-11-09T22:00:00.000Z" };
  assert.deepEqual(alteracoesDoAgendamento(original, dados), { notes: "Conta conferida." });
  assert.deepEqual(alteracoesDoAgendamento({ ...original, origin: "manual" }, dados), { notes: "Conta conferida." });
  assert.deepEqual(alteracoesDoAgendamento({ ...original, origin: "manual" }, { ...dados, dueAt: "2026-11-09T22:30:00.000Z" }), { notes: "Conta conferida.", dueAt: "2026-11-09T22:30:00.000Z" });
});
