import assert from "node:assert/strict";
import { it } from "node:test";
import {
  createActivityRequestSchema, updateActivityRequestSchema, completeActivityRequestSchema,
  listActivitiesQuerySchema,
} from "../dist/activities.js";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const schedule = { ownerId: id(1), startsAt: "2026-11-09T09:00:00-04:00", dueAt: "2026-11-09T09:00:00-04:00" };
const create = { requestId: id(2), target: { kind: "deal", dealId: id(3) }, type: "call", title: "  Retornar ligação  ", ...schedule };

it("atividade usa um alvo e instante com offset; compromisso sem duração é válido", () => {
  const parsed = createActivityRequestSchema.parse(create);
  assert.equal(parsed.title, "Retornar ligação");
  assert.equal(parsed.startsAt, "2026-11-09T13:00:00.000Z");
  assert.equal(parsed.dueAt, parsed.startsAt);
  assert.equal(parsed.priority, "normal");
  assert.equal(parsed.notes, "");
  for (const changes of [
    { target: { kind: "deal", dealId: id(3), clientId: id(4) } },
    { startsAt: "2026-11-09T09:00:00" }, { dueAt: "2026-11-08T18:00:00Z" },
    { origin: "process" }, { ruleKey: "solar.proposal" }, { status: "done" }, { status: "doing" },
  ]) assert.equal(createActivityRequestSchema.safeParse({ ...create, ...changes }).success, false);
  assert.equal(createActivityRequestSchema.safeParse({ ...create, target: { kind: "client", clientId: id(4) } }).success, true);
});

it("edição exige CAS e não aceita concluir, trocar alvo ou enviar patch vazio", () => {
  for (const patch of [{ title: "Teste" }, { version: 1 }, { version: 1, status: "done" }, { version: 1, target: create.target }]) {
    assert.equal(updateActivityRequestSchema.safeParse(patch).success, false);
  }
  assert.deepEqual(updateActivityRequestSchema.parse({ version: 2, status: "doing" }), { version: 2, status: "doing" });
});

it("conclusão exige relato/rodada/versão e valida a próxima ação completa", () => {
  const done = { version: 2, roundId: id(5), outcome: { summary: "Contato confirmou interesse" } };
  assert.deepEqual(completeActivityRequestSchema.parse(done).outcome.documentIds, []);
  for (const changes of [{ version: 0 }, { outcome: { summary: "  " } }, { nextAction: { title: "Amanhã" } }, { outcome: { summary: "OK", documentIds: [id(9), id(9)] } }]) {
    assert.equal(completeActivityRequestSchema.safeParse({ ...done, ...changes }).success, false);
  }
  assert.equal(completeActivityRequestSchema.safeParse({ ...done, nextAction: { type: "task", title: "Enviar proposta", ...schedule } }).success, true);
});

it("consulta da ficha pede alvo e não combina Deal/Client", () => {
  assert.equal(listActivitiesQuerySchema.safeParse({ scope: "target" }).success, false);
  assert.equal(listActivitiesQuerySchema.safeParse({ dealId: id(3), clientId: id(4) }).success, false);
  assert.equal(listActivitiesQuerySchema.safeParse({ scope: "target", dealId: id(3) }).success, true);
  assert.equal(listActivitiesQuerySchema.parse({}).scope, "mine");
  assert.equal(listActivitiesQuerySchema.safeParse({ limit: "101" }).success, false);
});
