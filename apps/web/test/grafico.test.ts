import assert from "node:assert/strict";
import { test } from "node:test";

import { passoDoEixo } from "../app/lib/grafico.ts";

test("passo do eixo é redondo e cobre o máximo em 4 divisões", () => {
  assert.equal(passoDoEixo(36), 10);
  assert.equal(passoDoEixo(40), 10);
  assert.equal(passoDoEixo(41), 20);
  assert.equal(passoDoEixo(9), 2.5);
  assert.equal(passoDoEixo(3), 1);
  assert.equal(passoDoEixo(38200), 10000);
  assert.equal(passoDoEixo(0), 1);
  for (const m of [1, 7, 12.5, 99, 120, 4321, 38200]) assert.ok(passoDoEixo(m) * 4 >= m);
});
