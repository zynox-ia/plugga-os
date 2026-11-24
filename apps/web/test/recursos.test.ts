import assert from "node:assert/strict";
import { test } from "node:test";

import { podeAbrirPagina } from "../app/lib/acesso-paginas.ts";
import { engenhariaHabilitado, financeiroHabilitado } from "../app/lib/recursos.ts";

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

test("a Engenharia tem o mesmo portão, com a variável dela (PLU-345)", () => {
  assert.equal(engenhariaHabilitado({ NODE_ENV: "development" }), true);
  assert.equal(engenhariaHabilitado({ NODE_ENV: "test" }), true);
  assert.equal(engenhariaHabilitado({}), false);
  assert.equal(engenhariaHabilitado({ NODE_ENV: "production" }), false);
  // A variável do Financeiro não liga a Engenharia, nem o contrário.
  assert.equal(engenhariaHabilitado({ NODE_ENV: "production", NEXT_PUBLIC_FINANCEIRO_HABILITADO: "true" }), false);
  assert.equal(financeiroHabilitado({ NODE_ENV: "production", NEXT_PUBLIC_ENGENHARIA_HABILITADO: "true" }), false);
  assert.equal(engenhariaHabilitado({ NODE_ENV: "production", NEXT_PUBLIC_ENGENHARIA_HABILITADO: "1" }), false);
  assert.equal(engenhariaHabilitado({ NODE_ENV: "production", NEXT_PUBLIC_ENGENHARIA_HABILITADO: "true" }), true);
});

test("Ordens de serviço: fechada com o portão desligado; aberta com a tela de O.S., instalação, manutenção ou visita", () => {
  const caminho = "/engenharia/ordens-de-servico";
  const desligado = { NODE_ENV: "production" };
  const ligado = { NODE_ENV: "development" };
  const com = (tela: string) => ({ plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "membro", telas: [tela] }] }) as Parameters<typeof podeAbrirPagina>[0];
  assert.equal(podeAbrirPagina({ plataforma: "admin", departamentos: [] }, caminho, desligado), false);
  assert.equal(podeAbrirPagina({ plataforma: "admin", departamentos: [] }, caminho, ligado), true);
  for (const tela of ["engenharia-obras.os", "engenharia-obras.instalacoes", "engenharia-obras.manutencao", "engenharia-obras.visitas"]) {
    assert.equal(podeAbrirPagina(com(tela), caminho, ligado), true, tela);
  }
  assert.equal(podeAbrirPagina(com("engenharia-obras.obras"), caminho, ligado), false);
  assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "gerente" }] }, caminho, ligado), false);
});
