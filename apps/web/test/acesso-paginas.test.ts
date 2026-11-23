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

test("Fornecedores abre só com a tela suprimentos.fornecedores (PLU-326)", () => {
  const caminho = "/suprimentos/fornecedores";
  assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro", telas: ["suprimentos.fornecedores"] }] }, caminho), true);
  assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro", telas: ["suprimentos.compras"] }] }, caminho), false);
  assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] }, caminho), false);
  assert.equal(podeAbrirPagina({ plataforma: "admin", departamentos: [] }, caminho), true);
  assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro" }] }, "/suprimentos/fornecedores-outros"), false);
});

test("Lançamentos abre com financeiro.pagar ou financeiro.receber (PLU-336)", () => {
  const caminho = "/financeiro/lancamentos";
  // Com o portão do Financeiro ligado, como no localhost (o teste não depende do NODE_ENV da máquina).
  const abre = (acesso: Acesso, pathname: string) => podeAbrirPagina(acesso, pathname, { NODE_ENV: "development" });
  const so = (...telas: ("financeiro.pagar" | "financeiro.receber" | "financeiro.conciliacao" | "financeiro.fiscal")[]): Acesso =>
    ({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro", telas }] });
  assert.equal(abre(so("financeiro.pagar"), caminho), true);
  assert.equal(abre(so("financeiro.receber"), `${caminho}/qualquer`), true);
  assert.equal(abre(so("financeiro.conciliacao", "financeiro.fiscal"), caminho), false);
  assert.equal(abre(so(), caminho), false);
  assert.equal(abre({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "gerente" }] }, caminho), true);
  assert.equal(abre({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] }, caminho), false);
  assert.equal(abre({ plataforma: "admin", departamentos: [] }, caminho), true);
  assert.equal(abre(so("financeiro.pagar"), "/financeiro/lancamentos-outros"), false);
});

test("Compras abre com a tela suprimentos.compras ou com o Financeiro (PLU-328)", () => {
  const caminho = "/suprimentos/compras";
  assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro", telas: ["suprimentos.compras"] }] }, caminho), true);
  assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro", telas: ["suprimentos.fornecedores"] }] }, caminho), false);
  // O Financeiro também abre: o gerente aprova e revisa, o membro paga (regra da API, decisão do André).
  assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "gerente" }] }, caminho), true);
  assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro" }] }, `${caminho}?pedido=x`.split("?")[0]!), true);
  assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] }, caminho), false);
  assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "membro" }] }, caminho), false);
  assert.equal(podeAbrirPagina({ plataforma: "admin", departamentos: [] }, caminho), true);
});
