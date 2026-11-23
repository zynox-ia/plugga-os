import assert from "node:assert/strict";
import { test } from "node:test";

import { podeAbrirPagina } from "../app/lib/acesso-paginas.ts";
import { financeiroHabilitado } from "../app/lib/recursos.ts";

test("o Financeiro fica ligado no desenvolvimento e nos testes, inclusive sem a variável", () => {
  assert.equal(financeiroHabilitado({ NODE_ENV: "development" }), true);
  assert.equal(financeiroHabilitado({ NODE_ENV: "test" }), true);
});

test("sem NODE_ENV conhecido, fica desligado (falha fechada), salvo com a variável", () => {
  assert.equal(financeiroHabilitado({}), false);
  assert.equal(financeiroHabilitado({ NODE_ENV: "staging" }), false);
  assert.equal(financeiroHabilitado({ NEXT_PUBLIC_FINANCEIRO_HABILITADO: "true" }), true);
});

test("na produção, só com NEXT_PUBLIC_FINANCEIRO_HABILITADO=true (a CI); sem ela, desligado", () => {
  assert.equal(financeiroHabilitado({ NODE_ENV: "production" }), false);
  for (const valor of ["", "false", "1", "TRUE "]) {
    assert.equal(financeiroHabilitado({ NODE_ENV: "production", NEXT_PUBLIC_FINANCEIRO_HABILITADO: valor }), false, valor);
  }
  assert.equal(financeiroHabilitado({ NODE_ENV: "production", NEXT_PUBLIC_FINANCEIRO_HABILITADO: "true" }), true);
});

test("com o portão desligado, nenhuma página do Financeiro abre, nem para o admin", () => {
  const admin = { plataforma: "admin", departamentos: [] } as const;
  const desligado = { NODE_ENV: "production" };
  assert.equal(podeAbrirPagina({ ...admin, departamentos: [] }, "/financeiro/lancamentos", desligado), false);
  assert.equal(podeAbrirPagina({ ...admin, departamentos: [] }, "/financeiro", desligado), false);
  assert.equal(podeAbrirPagina({ ...admin, departamentos: [] }, "/financeiro/lancamentos", { NODE_ENV: "development" }), true);
  // O portão não alcança outras rotas.
  assert.equal(podeAbrirPagina({ ...admin, departamentos: [] }, "/suprimentos/compras", desligado), true);
});
