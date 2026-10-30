import assert from "node:assert/strict";
import { test } from "node:test";
import { podeAbrirPagina } from "../app/lib/acesso-paginas.ts";

test("URL direta respeita tela permitida e não confunde prefixos", () => {
  const acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.pipelines"] }] } as const;
  const editavel = { plataforma: acesso.plataforma, departamentos: acesso.departamentos.map((d) => ({ ...d, telas: [...d.telas] })) };
  assert.equal(podeAbrirPagina(editavel, "/clientes/123"), false);
  assert.equal(podeAbrirPagina(editavel, "/comercial/pipelines"), true);
  assert.equal(podeAbrirPagina(editavel, "/comercial/contratos/123"), false);
  assert.equal(podeAbrirPagina(editavel, "/configuracoes"), true);
  assert.equal(podeAbrirPagina({ plataforma: "admin", departamentos: [] }, "/clientes"), true);
});
