import assert from "node:assert/strict";
import { test } from "node:test";
import { acessoSchema, alcancaTela } from "../src/acesso.ts";

test("telas selecionadas persistem no contrato e lista vazia não autoriza", () => {
  const acesso = acessoSchema.parse({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] }] });
  assert.equal(alcancaTela(acesso, "crm.pipelines"), true);
  assert.equal(alcancaTela(acesso, "crm.clientes"), false);
  assert.equal(alcancaTela({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: [] }] }, "crm.pipelines"), false);
  assert.equal(alcancaTela({ plataforma: "admin", departamentos: [] }, "crm.clientes"), true);
});

test("recusa telas desconhecidas, repetidas e de outro departamento", () => {
  for (const telas of [["inventada"], ["crm.clientes", "crm.clientes"], ["financeiro.fiscal"]]) {
    assert.equal(acessoSchema.safeParse({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas }] }).success, false);
  }
});
