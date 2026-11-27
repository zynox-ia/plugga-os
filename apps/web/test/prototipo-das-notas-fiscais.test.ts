import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { itemDasNotasFiscais, prototipoDasNotasFiscais } from "../app/lib/prototipo-das-notas-fiscais.ts";

describe("protótipo das Notas fiscais só fora da produção (PLU-361)", () => {
  it("abre no desenvolvimento e nos testes", () => {
    assert.equal(prototipoDasNotasFiscais({ NODE_ENV: "development" }), true);
    assert.equal(prototipoDasNotasFiscais({ NODE_ENV: "test" }), true);
    assert.deepEqual(itemDasNotasFiscais({ NODE_ENV: "development" }), { rota: "/financeiro/notas-fiscais", status: "parcial" });
  });

  it("na produção a rota fecha (404) e o item do menu fica em breve, sem rota", () => {
    assert.equal(prototipoDasNotasFiscais({ NODE_ENV: "production" }), false);
    assert.deepEqual(itemDasNotasFiscais({ NODE_ENV: "production" }), { status: "em-breve" });
  });

  it("nem o build da CI, com o Financeiro ligado pela variável, abre o protótipo", () => {
    const daCi = { NODE_ENV: "production", NEXT_PUBLIC_FINANCEIRO_HABILITADO: "true" };
    assert.equal(prototipoDasNotasFiscais(daCi), false);
    assert.deepEqual(itemDasNotasFiscais(daCi), { status: "em-breve" });
  });

  it("sem NODE_ENV conhecido, fica fechado (falha fechada)", () => {
    assert.equal(prototipoDasNotasFiscais({}), false);
    assert.equal(prototipoDasNotasFiscais({ NODE_ENV: "" }), false);
    assert.equal(prototipoDasNotasFiscais({ NODE_ENV: "staging" }), false);
  });
});
