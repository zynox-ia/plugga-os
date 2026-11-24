import assert from "node:assert/strict";
import { test } from "node:test";
import { activitySchema } from "@plugga/shared";
import { proximaAtividade } from "../app/lib/proxima-atividade.ts";

const id = (numero: number) => `10000000-0000-4000-8000-${String(numero).padStart(12, "0")}`;
function atividade(numero: number, dueAt: string, status: "todo" | "doing" | "done" = "todo") {
  const actor = { type: "user", id: id(99) };
  const inicio = "2026-11-01T12:00:00.000Z";
  return activitySchema.parse({
    id: id(numero), version: 1, target: { kind: "deal", dealId: id(98) }, type: "task", title: "Próximo passo", notes: "", priority: "normal",
    origin: "manual", ruleKey: null, createdAt: inicio, createdBy: actor,
    currentRound: { id: id(numero + 20), number: 1, status, ownerId: actor.id, startsAt: inicio, dueAt, openedAt: inicio, openedBy: actor,
      endedAt: null, endReason: null, completedAt: null, completedBy: null, outcome: null, nextActivityId: null },
  });
}

test("próxima ação prioriza pendência atrasada e ignora atividades concluídas", () => {
  const futuras = atividade(1, "2026-12-01T22:00:00.000Z");
  const atrasada = atividade(2, "2026-11-02T22:00:00.000Z", "doing");
  const concluida = atividade(3, "2026-11-01T22:00:00.000Z", "done");
  assert.equal(proximaAtividade([futuras, concluida, atrasada])?.id, atrasada.id);
  assert.equal(proximaAtividade([concluida]), null);
  assert.equal(proximaAtividade([]), null);
});

test("desempate por identidade é estável e a seleção não reordena a lista recebida", () => {
  const a = atividade(1, "2026-11-09T22:00:00.000Z");
  const b = atividade(2, a.currentRound.dueAt);
  const entrada = [b, a];
  assert.equal(proximaAtividade(entrada)?.id, a.id);
  assert.deepEqual(entrada.map((item) => item.id), [b.id, a.id]);
});
