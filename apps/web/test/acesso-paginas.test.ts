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
  assert.equal(abre(so("financeiro.pagar"), "/financeiro/visao-geral"), true);
  assert.equal(abre(so("financeiro.conciliacao"), "/financeiro/visao-geral"), false);
  assert.equal(abre(so("financeiro.conciliacao"), "/financeiro/conciliacao"), true);
  assert.equal(abre(so("financeiro.pagar"), "/financeiro/conciliacao"), false);
  assert.equal(podeAbrirPagina(so("financeiro.conciliacao"), "/financeiro/conciliacao", { NODE_ENV: "production" }), false);
});

test("Tarefas do Financeiro abre com qualquer tela do Financeiro, e só com o portão aberto (PLU-340)", () => {
  const caminho = "/financeiro/tarefas";
  const so = (...telas: ("financeiro.pagar" | "financeiro.receber" | "financeiro.conciliacao" | "financeiro.fiscal")[]): Acesso =>
    ({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro", telas }] });
  const abre = (acesso: Acesso) => podeAbrirPagina(acesso, caminho, { NODE_ENV: "development" });
  assert.equal(abre(so("financeiro.fiscal")), true);
  assert.equal(abre(so("financeiro.conciliacao")), true);
  assert.equal(abre(so()), false);
  assert.equal(abre({ plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "gerente" }] }), false);
  assert.equal(podeAbrirPagina(so("financeiro.pagar"), caminho, { NODE_ENV: "production" }), false);
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

test("Protocolos abre com a tela de protocolos da Engenharia ou do Operacional, com o portão aberto (PLU-348)", () => {
  const caminho = "/engenharia/protocolos";
  const abre = (acesso: Acesso, NODE_ENV = "development") => podeAbrirPagina(acesso, caminho, { NODE_ENV });
  assert.equal(abre({ plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.protocolos"] }] }), true);
  assert.equal(abre({ plataforma: null, departamentos: [{ departamento: "energia-opm", nivel: "membro", telas: ["energia-opm.protocolos"] }] }), true);
  assert.equal(abre({ plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.usinas"] }] }), false);
  assert.equal(abre({ plataforma: null, departamentos: [{ departamento: "energia-opm", nivel: "membro", telas: ["energia-opm.ciclos"] }] }), false);
  assert.equal(abre({ plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.protocolos"] }] }, "production"), false);
});

test("Obras abre com a tela de Obras, com o portão aberto (PLU-350)", () => {
  const caminho = "/engenharia/obras";
  const abre = (telas: ("engenharia-obras.obras" | "engenharia-obras.os")[], NODE_ENV = "development") =>
    podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "membro", telas }] }, caminho, { NODE_ENV });
  assert.equal(abre(["engenharia-obras.obras"]), true);
  assert.equal(abre(["engenharia-obras.os"]), false);
  assert.equal(abre(["engenharia-obras.obras"], "production"), false);
});
