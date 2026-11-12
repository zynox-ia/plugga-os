import assert from "node:assert/strict";
import { test } from "node:test";
import type { Acesso } from "@plugga/shared";
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

test("rotas técnicas negam Admin e só aceitam Desenvolvedor", () => {
  for (const caminho of ["/jobs", "/estrutura", "/design-system", "/design-system/cores"]) {
    assert.equal(podeAbrirPagina({ plataforma: "admin", departamentos: [] }, caminho), false, caminho);
    assert.equal(podeAbrirPagina({ plataforma: "desenvolvedor", departamentos: [] }, caminho), true, caminho);
    assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [] }, caminho), false, caminho);
  }
});

test("/integracoes abre para todo papel, porque o Google Calendar é integração pessoal", () => {
  assert.equal(podeAbrirPagina({ plataforma: "desenvolvedor", departamentos: [] }, "/integracoes"), true);
  assert.equal(podeAbrirPagina({ plataforma: "admin", departamentos: [] }, "/integracoes"), true);
  assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] }, "/integracoes"), true);
  assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro" }] }, "/integracoes"), true);
});

test("páginas sem regra negam acesso inclusive à plataforma; prefixos parecidos não herdam concessão", () => {
  for (const plataforma of [null, "admin", "desenvolvedor"] as const) {
    for (const caminho of ["/nova-tela", "/clientes-outros", "/comercial/contratos-outros", "/jobs-publicos"]) {
      assert.equal(podeAbrirPagina({ plataforma, departamentos: [] }, caminho), false, caminho);
    }
  }
});

test("revogar a tela bloqueia nova navegação sem trocar o papel", () => {
  const acesso: Acesso = { plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: ["crm.pipelines"] }] };
  for (const caminho of ["/comercial/pipelines", "/comercial/oportunidades/123", "/comercial/atividades", "/crm"]) {
    assert.equal(podeAbrirPagina(acesso, caminho), true, caminho);
  }
  acesso.departamentos[0]!.telas = [];
  for (const caminho of ["/comercial/pipelines", "/comercial/oportunidades/123", "/comercial/atividades", "/crm"]) {
    assert.equal(podeAbrirPagina(acesso, caminho), false, caminho);
  }
});

test("membro não abre gestão de equipe pela rota herdada", () => {
  assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.clientes"] }] }, "/administracao"), false);
  assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente", telas: ["crm.clientes"] }] }, "/administracao"), true);
});
