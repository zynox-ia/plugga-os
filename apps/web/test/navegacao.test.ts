import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { departamentos, telasPorDepartamento, type Acesso, type Tela } from "@plugga/shared";

/**
 * O sitemap é o do portão aberto (Financeiro e Engenharia, lib/recursos.ts), e
 * organizacao.ts monta os menus ao carregar: o ambiente é fixado ANTES de
 * importar, sem depender de NODE_ENV nem das flags de quem roda o teste.
 */
const ambiente = process.env as Record<string, string | undefined>;
const nodeEnvAnterior = ambiente.NODE_ENV;
ambiente.NODE_ENV = "test";
after(() => {
  if (nodeEnvAnterior === undefined) delete ambiente.NODE_ENV;
  else ambiente.NODE_ENV = nodeEnvAnterior;
});
const { CONFIGURACOES, DEPARTAMENTOS, configuracoesParaAcesso, telasDoDepartamento } = await import("../app/lib/organizacao.ts");
const { navGroupsForAccess, navIdForPathname, tituloForNavId } = await import("../app/lib/navigation.ts");

function rotulos(acesso?: Acesso) {
  return navGroupsForAccess(acesso ?? null)
    .filter((grupo) => grupo.collapsible)
    .map((grupo) => grupo.label);
}

it("seção técnica continua exclusiva do Desenvolvedor mesmo com mínimo cadastrado como Admin", () => {
  const quantidade = CONFIGURACOES.length;
  CONFIGURACOES.push({ id: "desenvolvedor", label: "Desenvolvedor", descricao: "Técnico", status: "pronto", minimo: "admin" });
  CONFIGURACOES.push({ label: "Jobs", descricao: "Técnico", rota: "/jobs", status: "pronto", minimo: "admin" });
  try {
    const admin = configuracoesParaAcesso({ plataforma: "admin", departamentos: [] });
    assert.ok(!admin.some((secao) => secao.id === "desenvolvedor" || secao.rota === "/jobs"));
    const dev = configuracoesParaAcesso({ plataforma: "desenvolvedor", departamentos: [] });
    assert.ok(dev.some((secao) => secao.id === "desenvolvedor"));
  } finally {
    CONFIGURACOES.splice(quantidade);
  }
});

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
    // Menu do Financeiro aprovado em 23/11/2026 (PLU-336); Fiscal fica fora do menu (P2).
    assert.deepEqual(itens["Financeiro"], [
      "Visão geral",
      "Lançamentos",
      "Tarefas",
      "Conciliação",
    ]);
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
      grupo.items.some((item) => item.label === "Compras"),
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

  it("quem é de Financeiro e Suprimentos vê Compras em Suprimentos, com a tela (PLU-328)", () => {
    const grupos = navGroupsForAccess(membro("financeiro", "suprimentos")).filter((grupo) => grupo.collapsible);
    assert.deepEqual(
      grupos.map((grupo) => grupo.label),
      ["Financeiro", "Suprimentos"],
    );
    assert.ok(grupos[1]?.items.some((item) => item.id === "/suprimentos/compras" && !item.disabled));
    assert.equal(navIdForPathname("/suprimentos/compras"), "/suprimentos/compras");
    assert.equal(tituloForNavId("/suprimentos/compras"), "Compras");
  });

  it("quem é só do Financeiro vê Suprimentos com Compras e nada mais (PLU-328)", () => {
    for (const nivel of ["membro", "gerente"] as const) {
      const grupos = navGroupsForAccess({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel }] }).filter((grupo) => grupo.collapsible);
      assert.deepEqual(grupos.map((grupo) => grupo.label), ["Financeiro", "Suprimentos"]);
      assert.deepEqual(grupos[1]?.items.map((item) => item.id), ["/suprimentos/compras"]);
    }
    // Quem não é de Compras nem do Financeiro não vê Suprimentos.
    assert.ok(!navGroupsForAccess(membro("crm")).some((grupo) => grupo.label === "Suprimentos"));
  });

  it("Fornecedores sai do em-breve e aponta para a tela (PLU-326)", () => {
    const suprimentos = navGroupsForAccess(membro("suprimentos")).find((grupo) => grupo.label === "Suprimentos");
    assert.ok(suprimentos?.items.some((item) => item.id === "/suprimentos/fornecedores" && !item.disabled));
    assert.equal(navIdForPathname("/suprimentos/fornecedores"), "/suprimentos/fornecedores");
    assert.equal(tituloForNavId("/suprimentos/fornecedores"), "Fornecedores");
  });

  it("não inventa departamento para quem não recebeu esse acesso", () => {
    assert.deepEqual(rotulos(membro("engenharia-obras")), ["Engenharia e Obras"]);
    // Exceção decidida (PLU-328): o Financeiro vê Suprimentos só com Compras, que é onde aprova e paga.
    assert.deepEqual(rotulos(membro("financeiro")), ["Financeiro", "Suprimentos"]);
  });

  it("não mostra departamento fora do catálogo de acesso", () => {
    const grupos = navGroupsForAccess().filter((grupo) => grupo.collapsible);
    assert.deepEqual(grupos.map((grupo) => grupo.id).sort(), [...departamentos].sort());
    assert.ok(!grupos.some((grupo) => grupo.label === "Marketing"), "Marketing saiu da barra lateral");
  });

  it("o menu do Financeiro segue as telas: Lançamentos com pagar ou receber, Conciliação com a dela (PLU-336)", () => {
    const itens = (...telas: Tela[]) => navGroupsForAccess({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro", telas }] })
      .find((grupo) => grupo.label === "Financeiro")?.items.map((item) => item.label);
    assert.deepEqual(itens("financeiro.pagar"), ["Visão geral", "Lançamentos", "Tarefas"]);
    assert.deepEqual(itens("financeiro.receber"), ["Visão geral", "Lançamentos", "Tarefas"]);
    assert.deepEqual(itens("financeiro.conciliacao"), ["Tarefas", "Conciliação"]);
    assert.deepEqual(itens("financeiro.fiscal"), ["Tarefas"]);
  });

  it("o editor de acesso concede as 4 telas do Financeiro, separadas do menu (PLU-336)", () => {
    const financeiro = DEPARTAMENTOS.find((departamento) => departamento.id === "financeiro")!;
    assert.deepEqual(telasDoDepartamento(financeiro).map((tela) => tela.id), [...telasPorDepartamento.financeiro]);
    assert.deepEqual(telasDoDepartamento(financeiro).map((tela) => tela.label), ["Contas a pagar", "Contas a receber", "Conciliação", "Fiscal"]);
    // Nos demais, as telas seguem o catálogo de acesso, na mesma ordem.
    for (const departamento of DEPARTAMENTOS.filter((d) => d.id !== "financeiro")) {
      assert.deepEqual(telasDoDepartamento(departamento).map((tela) => tela.id), [...telasPorDepartamento[departamento.id]], departamento.id);
    }
  });

  it("protocolos (PLU-348): concedíveis nos dois departamentos; no menu, só na Engenharia", () => {
    const energia = DEPARTAMENTOS.find((departamento) => departamento.id === "energia-opm")!;
    const engenharia = DEPARTAMENTOS.find((departamento) => departamento.id === "engenharia-obras")!;
    assert.ok(telasDoDepartamento(energia).some((tela) => tela.id === "energia-opm.protocolos"));
    assert.ok(telasDoDepartamento(engenharia).some((tela) => tela.id === "engenharia-obras.protocolos"));
    assert.ok(!energia.processos.some((processo) => processo.label === "Protocolos"));
    assert.ok(engenharia.processos.some((processo) => processo.id === "engenharia-obras.protocolos"));
  });

  it("menu da Engenharia segue o protótipo aprovado; as telas fora dele seguem no editor de acesso", () => {
    const engenharia = DEPARTAMENTOS.find((departamento) => departamento.id === "engenharia-obras")!;
    assert.deepEqual(engenharia.processos.map((processo) => processo.label), [
      "Visão geral", "Ordens de serviço", "Agenda de campo", "Usinas", "Protocolos", "Tarefas", "Obras",
    ]);
    // Nos testes o portão está aberto: cada item leva à sua tela.
    assert.ok(engenharia.processos.every((processo) => processo.rota?.startsWith("/engenharia/")));
    const telas = telasDoDepartamento(engenharia).map((tela) => tela.id);
    const foraDoMenu = ["engenharia-obras.projetos", "engenharia-obras.instalacoes", "engenharia-obras.manutencao", "engenharia-obras.visitas", "engenharia-obras.relatorios"] as const;
    for (const id of foraDoMenu) {
      assert.ok(telas.includes(id), id);
      assert.ok(!engenharia.processos.some((processo) => processo.id === id), id);
    }
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
    assert.deepEqual(rotulos(membro("engenharia-obras", "suprimentos", "financeiro", "crm")), [
      "CRM",
      "Financeiro",
      "Suprimentos",
      "Engenharia e Obras",
    ]);
    assert.deepEqual(
      DEPARTAMENTOS.map((departamento) => departamento.label),
      rotulos(),
    );
  });
});

describe("Configurações pelo papel", () => {
  const secoes = (acesso: Acesso) => configuracoesParaAcesso(acesso).map((secao) => secao.label);

  it("membro vê as configurações pessoais, com Integrações por causa da agenda do Google", () => {
    assert.deepEqual(secoes(membro("crm")), ["Perfil", "Segurança", "Notificações", "Integrações"]);
  });

  it("gerente vê as configurações pessoais, Equipe e Acessos e Integrações", () => {
    assert.deepEqual(secoes({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] }), [
      "Perfil",
      "Segurança",
      "Notificações",
      "Equipe e Acessos",
      "Integrações",
    ]);
  });

  it("admin vê as configurações administrativas, sem ferramentas técnicas; em Integrações só as pessoais", () => {
    const admin = secoes({ plataforma: "admin", departamentos: [] });
    assert.deepEqual(admin, [
      "Perfil",
      "Segurança",
      "Notificações",
      "Equipe e Acessos",
      "Integrações",
    ]);
  });

  it("desenvolvedor vê todas as configurações e ferramentas técnicas", () => {
    assert.deepEqual(secoes({ plataforma: "desenvolvedor", departamentos: [] }), [
      "Perfil",
      "Segurança",
      "Notificações",
      "Equipe e Acessos",
      "Integrações",
      "Desenvolvedor",
    ]);
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
