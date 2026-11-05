import assert from "node:assert/strict";
import { test } from "node:test";
import { tarefasHabilitadas } from "../app/lib/tarefas-habilitadas.ts";

test("tarefas temporárias ficam inacessíveis em produção e em ambiente não identificado", () => {
  assert.equal(tarefasHabilitadas("production"), false);
  assert.equal(tarefasHabilitadas(undefined), false);
  assert.equal(tarefasHabilitadas("staging"), false);
});

test("preserva as tarefas temporárias em desenvolvimento e teste", () => {
  assert.equal(tarefasHabilitadas("development"), true);
  assert.equal(tarefasHabilitadas("test"), true);
});
