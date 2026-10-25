import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { UserAccess } from "@plugga/shared";

import { ORDEM_DEPARTAMENTOS } from "../app/lib/organizacao.ts";
import { navGroupsForAccess, navIdForPathname, tituloForNavId } from "../app/lib/navigation.ts";

function rotulos(acesso?: UserAccess) {
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
    assert.deepEqual(itens["CRM"], ["Funis", "Clientes", "Propostas", "Contratos"]);
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

describe("acesso aos departamentos novos", () => {
  // A migração 20261025000000 copia cada acesso `financeiro` para `suprimentos`.
  // Quem vê Compras hoje a vê pelo Financeiro e precisa continuar vendo.
  it("quem tem financeiro e suprimentos vê Compras em Suprimentos", () => {
    const acesso: UserAccess = {
      platformRoles: [],
      companies: [
        {
          companyId: "plugga",
          roles: ["compras"],
          departments: [
            { departmentId: "financeiro", isManager: false },
            { departmentId: "suprimentos", isManager: false },
          ],
        },
      ],
    };
    const grupos = navGroupsForAccess(acesso).filter((grupo) => grupo.collapsible);
    assert.deepEqual(
      grupos.map((grupo) => grupo.label),
      ["Financeiro", "Suprimentos"],
    );
    assert.ok(grupos[1]?.items.some((item) => item.id === "/compras" && !item.disabled));
  });

  it("não inventa Marketing para quem não recebeu esse acesso", () => {
    const acesso: UserAccess = {
      platformRoles: [],
      companies: [
        {
          companyId: "plugga",
          roles: [],
          departments: [{ departmentId: "financeiro", isManager: false }],
        },
      ],
    };
    assert.ok(!rotulos(acesso).includes("Marketing"));
  });

  it("admin de plataforma vê tudo, inclusive os departamentos novos", () => {
    const labels = rotulos({ platformRoles: ["admin"], companies: [] });
    assert.ok(labels.includes("Suprimentos"));
    assert.ok(labels.includes("Marketing"));
  });

  it("segue a ordem aprovada quando o acesso é misto entre as empresas", () => {
    const acesso: UserAccess = {
      platformRoles: [],
      companies: [
        {
          companyId: "plugga",
          roles: [],
          departments: [
            { departmentId: "comercial-clientes", isManager: false },
            { departmentId: "suprimentos", isManager: false },
          ],
        },
        {
          companyId: "waze",
          roles: [],
          departments: [
            { departmentId: "engenharia-obras", isManager: false },
            { departmentId: "suprimentos", isManager: false },
          ],
        },
      ],
    };
    assert.deepEqual(rotulos(acesso), ["CRM", "Suprimentos", "Engenharia e Obras"]);
  });

  it("a ordem vem da lista explícita do catálogo, não da empresa que o libera", () => {
    const soWaze: UserAccess = {
      platformRoles: [],
      companies: [
        {
          companyId: "waze",
          roles: [],
          departments: [
            { departmentId: "marketing", isManager: false },
            { departmentId: "engenharia-obras", isManager: false },
            { departmentId: "financeiro", isManager: false },
            { departmentId: "comercial-obras", isManager: false },
          ],
        },
      ],
    };
    assert.deepEqual(rotulos(soWaze), ["CRM", "Financeiro", "Engenharia e Obras", "Marketing"]);
    assert.deepEqual([...ORDEM_DEPARTAMENTOS], rotulos());
  });
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
