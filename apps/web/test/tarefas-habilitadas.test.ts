import assert from "node:assert/strict";
import { test } from "node:test";
import { tarefasHabilitadas } from "../app/lib/tarefas-habilitadas.ts";

test("atividades persistentes ficam disponíveis em produção; ambiente não identificado continua fechado", () => {
  assert.equal(tarefasHabilitadas("production"), true);
  assert.equal(tarefasHabilitadas(undefined), false);
  assert.equal(tarefasHabilitadas("staging"), false);
});

test("disponibiliza as mesmas atividades persistentes em desenvolvimento e teste", () => {
  assert.equal(tarefasHabilitadas("development"), true);
  assert.equal(tarefasHabilitadas("test"), true);
});
