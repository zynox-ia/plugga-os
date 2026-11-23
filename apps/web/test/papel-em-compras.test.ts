import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Acesso } from "@plugga/shared";

import { papelEmCompras, podeCriarPedido, podeVerCompras } from "../app/lib/papel-em-compras.ts";

const so = (departamento: Acesso["departamentos"][number]["departamento"], nivel: "membro" | "gerente", telas?: Acesso["departamentos"][number]["telas"]): Acesso => ({
  plataforma: null,
  departamentos: [{ departamento, nivel, ...(telas ? { telas } : {}) }],
});

describe("papel em Compras, como na API", () => {
  it("o gerente do Financeiro vê e decide, mas não cria pedido", () => {
    const acesso = so("financeiro", "gerente");
    assert.deepEqual(papelEmCompras(acesso), { operaCompras: false, membroDoFinanceiro: true, gerenteDoFinanceiro: true });
    assert.equal(podeVerCompras(acesso), true);
    assert.equal(podeCriarPedido(acesso), false);
  });

  it("o membro do Financeiro vê para pagar, mas não aprova nem cria", () => {
    const acesso = so("financeiro", "membro");
    assert.deepEqual(papelEmCompras(acesso), { operaCompras: false, membroDoFinanceiro: true, gerenteDoFinanceiro: false });
    assert.equal(podeCriarPedido(acesso), false);
  });

  it("quem opera Compras cria; quem só tem Fornecedores ou CRM não entra", () => {
    assert.equal(podeCriarPedido(so("suprimentos", "membro", ["suprimentos.compras"])), true);
    assert.equal(podeVerCompras(so("suprimentos", "membro", ["suprimentos.fornecedores"])), false);
    assert.equal(podeVerCompras(so("crm", "gerente")), false);
    assert.equal(podeVerCompras(null), false);
  });
});
