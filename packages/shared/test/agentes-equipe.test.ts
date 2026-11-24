import assert from "node:assert/strict";
import test from "node:test";

import { criacaoDeAgenteSchema } from "../dist/index.js";

test("agente pertence a um departamento e recebe só telas desse departamento", () => {
  assert.equal(criacaoDeAgenteSchema.safeParse({ name: "Agente comercial", departamento: "crm", telas: ["crm.pipelines"] }).success, true);
  assert.equal(criacaoDeAgenteSchema.safeParse({ name: "Agente comercial", departamento: "crm", telas: ["financeiro.receber"] }).success, false);
  assert.equal(criacaoDeAgenteSchema.safeParse({ name: "Agente comercial", departamento: "crm", telas: ["crm.pipelines", "crm.pipelines"] }).success, false);
});

test("criação de agente não aceita papel de plataforma, gerente ou credencial enviada", () => {
  const entrada = { name: "Agente comercial", departamento: "crm", telas: [] };
  for (const extra of [{ plataforma: "admin" }, { nivel: "gerente" }, { token: "enviado" }, { userId: "outro" }]) {
    assert.equal(criacaoDeAgenteSchema.safeParse({ ...entrada, ...extra }).success, false);
  }
});
