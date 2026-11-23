import assert from "node:assert/strict";
import { test } from "node:test";

import { rotuloDaEntidade } from "../app/lib/rotulos-da-lista.ts";

test("a contagem da lista usa o nome com acento, no singular e no plural", () => {
  // Na CI 45233111029 a lista de negócios mostrava "de 23 negocios", a chave crua.
  assert.equal(rotuloDaEntidade("negocios", 23), "negócios");
  assert.equal(rotuloDaEntidade("negocios", 1), "negócio");
  assert.equal(rotuloDaEntidade("leads", 25), "leads");
  assert.equal(rotuloDaEntidade("clientes", 1), "cliente");
  assert.equal(rotuloDaEntidade("membros", 7), "membros");
  assert.equal(rotuloDaEntidade("fornecedores", 1), "fornecedor");
});
