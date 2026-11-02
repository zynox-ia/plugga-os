import assert from "node:assert/strict";
import { it } from "node:test";

import { velocidadeNaBorda, ordenarCartoes } from "../app/components/pipelines/arrasto-kanban.ts";

it("rola progressivamente nas bordas e mantém o centro parado", () => {
  assert.equal(velocidadeNaBorda(200, 100, 500), 0);
  assert.equal(velocidadeNaBorda(100, 100, 500), -720);
  assert.equal(velocidadeNaBorda(500, 100, 500), 720);
  assert.equal(velocidadeNaBorda(132, 100, 500), -360);
  assert.equal(velocidadeNaBorda(520, 100, 500), 720);
  assert.equal(velocidadeNaBorda(600, 100, 500), 0);
});

it("ordem visual não esconde novos cartões nem ressuscita cartões removidos", () => {
  const cartoes = [{ id: "novo" }, { id: "a" }, { id: "b" }];
  assert.deepEqual(ordenarCartoes(cartoes, ["b", "removido", "a"]), [cartoes[0], cartoes[2], cartoes[1]]);
  assert.deepEqual(ordenarCartoes(cartoes, undefined), cartoes);
});
