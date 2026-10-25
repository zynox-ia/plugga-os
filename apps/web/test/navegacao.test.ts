import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Acesso } from "@plugga/shared";

import { DEPARTAMENTOS, configuracoesParaAcesso } from "../app/lib/organizacao.ts";
import { navGroupsForAccess, navIdForPathname, tituloForNavId } from "../app/lib/navigation.ts";

function rotulos(acesso?: Acesso) {
  return navGroupsForAccess(acesso ?? null)
    .filter((grupo) => grupo.collapsible)
    .map((grupo) => grupo.label);
}

describe("sitemap da barra lateral", () => {
  it("segue a ordem aprovada, com Visão geral primeiro", () => {
    const grupos = navGroupsForAccess();
    assert.deepEqual(
      grupos.map((grupo) => grupo.label),
      [
        "Visão geral",
        "CRM",
        "Energia",
        "Eletromobilidade",
        "Financeiro",
        "Suprimentos",
        "Engenharia e Obras",
        "Marketing",
        "Ferramentas",
      ],
    );
  });

  it("lista os processos de cada departamento como aprovado", () => {
    const itens = Object.fromEntries(
      navGroupsForAccess().map((grupo) => [grupo.label, grupo.items.map((item) => item.label)]),
    );
    assert.deepEqual(itens["CRM"], ["Pipelines", "Clientes", "Propostas", "Contratos"]);
    assert.deepEqual(itens["Suprimentos"], ["Compras", "Fornecedores", "Estoque"]);
    assert.deepEqual(itens["Financeiro"], [
      "Contas a pagar",
      "Contas a receber",
      "Conciliação",
      "Fiscal",
    ]);
    assert.deepEqual(itens["Marketing"], ["Campanhas"]);
    assert.ok(!itens["Engenharia e Obras"]?.includes("Estoque e entrega em obra"));
  });

  it("Visão geral é só o Dashboard, sem Central de Pendências", () => {
    const visaoGeral = navGroupsForAccess()[0];
    assert.equal(visaoGeral?.id, "visao-geral");
    assert.deepEqual(visaoGeral?.items.map((item) => item.label), ["Dashboard"]);
  });

  it("Ferramentas fecha a barra com Agentes IA e Configurações; Atividades e Documentos ficam fora, mas a rota resolve", () => {
    const grupos = navGroupsForAccess();
    const ferramentas = grupos.at(-1);
    assert.equal(ferramentas?.id, "ferramentas");
    assert.deepEqual(ferramentas?.items.map((item) => item.label), ["Agentes IA", "Configurações"]);
    assert.equal(ferramentas?.items.at(-1)?.id, "/configuracoes");
    const rotulosDoMenu = grupos.flatMap((grupo) => grupo.items).map((item) => item.label);
    for (const fora of ["Atividades", "Documentos", "Relatórios", "Central de Pendências"]) {
      assert.ok(!rotulosDoMenu.includes(fora), `${fora} não deve estar no menu`);
    }
    assert.equal(navIdForPathname("/documentos"), "/documentos");
    assert.equal(tituloForNavId("/agentes-ia"), "Agentes IA");
    assert.equal(tituloForNavId("/comercial/atividades"), "Atividades");
  });

  it("Compras só tem item em Suprimentos", () => {
    const comCompras = navGroupsForAccess().filter((grupo) =>
      grupo.items.some((item) => item.id === "/compras"),
    );
    assert.deepEqual(
      comCompras.map((grupo) => grupo.label),
      ["Suprimentos"],
    );
  });
});

describe("barra lateral pelo acesso", () => {
  const membro = (...departamentos: Acesso["departamentos"][number]["departamento"][]): Acesso => ({
    plataforma: null,
    departamentos: departamentos.map((departamento) => ({ departamento, nivel: "membro" })),
  });

  it("quem é de Financeiro e Suprimentos vê Compras em Suprimentos", () => {
    const grupos = navGroupsForAccess(membro("financeiro", "suprimentos")).filter((grupo) => grupo.collapsible);
    assert.deepEqual(
      grupos.map((grupo) => grupo.label),
      ["Financeiro", "Suprimentos"],
    );
    assert.ok(grupos[1]?.items.some((item) => item.id === "/compras" && !item.disabled));
  });

  it("não inventa Marketing para quem não recebeu esse acesso", () => {
    assert.ok(!rotulos(membro("financeiro")).includes("Marketing"));
  });

  it("gerente vê o departamento que gere, como o membro", () => {
    assert.deepEqual(rotulos({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] }), ["CRM"]);
  });

  it("admin e desenvolvedor veem todos os departamentos", () => {
    const todos = DEPARTAMENTOS.map((departamento) => departamento.label);
    assert.deepEqual(rotulos({ plataforma: "admin", departamentos: [] }), todos);
    assert.deepEqual(rotulos({ plataforma: "desenvolvedor", departamentos: [] }), todos);
  });

  it("a ordem vem do catálogo, não da ordem do acesso", () => {
    assert.deepEqual(rotulos(membro("marketing", "engenharia-obras", "financeiro", "crm")), [
      "CRM",
      "Financeiro",
      "Engenharia e Obras",
      "Marketing",
    ]);
    assert.deepEqual(
      DEPARTAMENTOS.map((departamento) => departamento.label),
      rotulos(),
    );
  });
});

describe("Configurações pelo papel", () => {
  const secoes = (acesso: Acesso) => configuracoesParaAcesso(acesso).map((secao) => secao.label);

  it("membro não vê nenhuma seção de configuração do sistema", () => {
    assert.deepEqual(secoes(membro("crm")), []);
  });

  it("gerente vê só Equipe e acessos", () => {
    assert.deepEqual(secoes({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] }), [
      "Equipe e acessos",
    ]);
  });

  it("admin vê o que faz a plataforma funcionar, mas não as telas técnicas", () => {
    const admin = secoes({ plataforma: "admin", departamentos: [] });
    assert.ok(admin.includes("Equipe e acessos") && admin.includes("Chave de IA") && admin.includes("Integrações"));
    assert.ok(!admin.includes("Jobs e automações"));
  });

  it("desenvolvedor vê tudo, inclusive as telas técnicas", () => {
    assert.equal(secoes({ plataforma: "desenvolvedor", departamentos: [] }).length, 7);
  });

  function membro(...departamentos: Acesso["departamentos"][number]["departamento"][]): Acesso {
    return { plataforma: null, departamentos: departamentos.map((departamento) => ({ departamento, nivel: "membro" })) };
  }
});

describe("ícones da barra", () => {
  it("nenhum ícone se repete entre os itens de primeiro nível", () => {
    const grupos = navGroupsForAccess();
    const icones = grupos.flatMap((grupo) =>
      grupo.collapsible ? [grupo.icon] : grupo.items.map((item) => item.icon),
    );
    assert.ok(icones.every((icone) => icone !== undefined));
    assert.equal(new Set(icones).size, icones.length, `ícones repetidos: ${icones.join(", ")}`);
  });

  it("Engenharia e Obras não usa o ícone de chave inglesa", () => {
    const engenharia = navGroupsForAccess().find((grupo) => grupo.label === "Engenharia e Obras");
    assert.equal(engenharia?.icon, "hardhat");
  });
});
