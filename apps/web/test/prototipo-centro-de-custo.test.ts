import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import type { Acesso, Tela } from "@plugga/shared";

import { fechadaPeloPortaoDoFinanceiro, podeAbrirPagina } from "../app/lib/acesso-paginas.ts";
import {
  filtrarProjetos,
  hrefDosProjetos,
  lerFiltrosDosProjetos,
  projetosPorCliente,
  projetoVazio,
  reais,
  resumoDoProjeto,
  saidasPorCategoria,
  totalDaSaidaDoEstoque,
  type Projeto,
} from "../app/lib/prototipo-centro-de-custo.ts";
import { clientesDeExemplo, projetoDeExemplo, PROJETOS_DE_EXEMPLO } from "../app/lib/prototipo-centro-de-custo-exemplos.ts";
import { itemDoCentroDeCusto, prototipoDoCentroDeCustoHabilitado } from "../app/lib/recursos.ts";

const so = (...telas: Tela[]): Acesso => ({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro", telas }] });
const ROTA = "/financeiro/centro-de-custo";

describe("protótipo do Centro de custo só fora da produção (PLU-362)", () => {
  it("abre no desenvolvimento e nos testes, com qualquer tela do Financeiro", () => {
    assert.equal(prototipoDoCentroDeCustoHabilitado({ NODE_ENV: "development" }), true);
    assert.equal(prototipoDoCentroDeCustoHabilitado({ NODE_ENV: "test" }), true);
    assert.deepEqual(itemDoCentroDeCusto({ NODE_ENV: "development" }), { rota: ROTA, status: "parcial" });
    for (const tela of ["financeiro.pagar", "financeiro.receber", "financeiro.conciliacao", "financeiro.fiscal", "financeiro.relatorios"] as const) {
      assert.equal(podeAbrirPagina(so(tela), `${ROTA}/usina-solar-residencial-joao`, { NODE_ENV: "development" }), true, tela);
    }
    assert.equal(podeAbrirPagina({ plataforma: null, departamentos: [{ departamento: "crm", nivel: "gerente" }] }, ROTA, { NODE_ENV: "development" }), false);
  });

  it("na produção a rota é 404 no middleware e o item do menu fica em breve, sem rota", () => {
    const producao = { NODE_ENV: "production" };
    assert.equal(prototipoDoCentroDeCustoHabilitado(producao), false);
    assert.deepEqual(itemDoCentroDeCusto(producao), { status: "em-breve" });
    assert.equal(fechadaPeloPortaoDoFinanceiro(ROTA, producao), true);
    assert.equal(podeAbrirPagina(so("financeiro.pagar"), ROTA, producao), false);
  });

  it("nem o build da CI, com o Financeiro ligado pela variável, abre o protótipo; o resto do Financeiro segue aberto", () => {
    const daCi = { NODE_ENV: "production", NEXT_PUBLIC_FINANCEIRO_HABILITADO: "true" };
    assert.equal(prototipoDoCentroDeCustoHabilitado(daCi), false);
    assert.deepEqual(itemDoCentroDeCusto(daCi), { status: "em-breve" });
    for (const caminho of [ROTA, `${ROTA}/usina-solar-residencial-joao`, "/financeiro/%63entro-de-custo", "/financeiro/Centro-de-Custo/", "/financeiro//centro-de-custo"]) {
      assert.equal(fechadaPeloPortaoDoFinanceiro(caminho, daCi), true, caminho);
      assert.equal(podeAbrirPagina(so("financeiro.pagar"), caminho, daCi), false, caminho);
    }
    assert.equal(fechadaPeloPortaoDoFinanceiro("/financeiro/lancamentos", daCi), false);
    assert.equal(podeAbrirPagina(so("financeiro.pagar"), "/financeiro/lancamentos", daCi), true);
  });

  it("sem NODE_ENV conhecido, fica fechado (falha fechada)", () => {
    assert.equal(prototipoDoCentroDeCustoHabilitado({}), false);
    assert.equal(prototipoDoCentroDeCustoHabilitado({ NODE_ENV: "" }), false);
    assert.equal(prototipoDoCentroDeCustoHabilitado({ NODE_ENV: "staging" }), false);
  });
});

const projeto = (id: string): Projeto => projetoDeExemplo(id)!;
const soma = (valores: number[]) => valores.reduce((t, v) => t + v, 0);

describe("números do centro de custo de exemplo (PLU-362)", () => {
  it("os totais batem com a soma das linhas; cancelado não entra", () => {
    for (const p of PROJETOS_DE_EXEMPLO) {
      const r = resumoDoProjeto(p);
      const entradas = p.entradas.filter((e) => e.situacao !== "cancelada");
      const saidas = p.saidas.filter((s) => s.situacao !== "cancelada");
      assert.equal(r.recebido + r.aReceber, soma(entradas.map((e) => e.valor)), p.id);
      assert.equal(r.pago + r.aPagar, soma(saidas.map((s) => s.valor)), p.id);
      assert.equal(r.material, soma(p.material.map(totalDaSaidaDoEstoque)), p.id);
      assert.equal(r.gasto, r.pago + r.material, p.id);
      assert.equal(r.resultado, r.recebido - r.gasto, p.id);
      assert.equal(r.resultadoPrevisto, r.recebido + r.aReceber - r.pago - r.aPagar - r.material, p.id);
      // As saídas por categoria somam o mesmo que o resumo.
      assert.equal(soma(saidasPorCategoria(p).map((g) => g.total)), r.pago + r.aPagar, p.id);
    }
    const solar = resumoDoProjeto(projeto("usina-solar-residencial-joao"));
    // CP-0238 (frete em dobro, 620,00) está cancelada: não soma.
    assert.equal(solar.pago, 3_253_314);
    assert.equal(solar.material, 362_400);
    const clinica = resumoDoProjeto(projeto("gestao-de-energia-vida-plena"));
    assert.equal(clinica.aReceber, 210_000, "a cobrança emitida em dobro está cancelada");
  });

  it("o pedido de compra não soma de novo: o custo dele está na conta a pagar ou no material do estoque", () => {
    for (const p of PROJETOS_DE_EXEMPLO) {
      for (const c of p.compras) {
        if (c.custo.tipo !== "conta") continue;
        const codigo = c.custo.codigo;
        const conta = p.saidas.find((s) => s.codigo === codigo);
        assert.ok(conta, `${c.codigo} → ${codigo}`);
        assert.deepEqual(conta.origem, { tipo: "pedido_de_compra", codigo: c.codigo });
      }
    }
  });

  it("orçamento: consumido conta o pago, o a pagar e o material; estourado acima de 100%", () => {
    const condominio = resumoDoProjeto(projeto("usina-solar-condominio"));
    assert.equal(condominio.orcamento?.estourou, true);
    assert.equal(condominio.orcamento?.percentual, 108);
    const solar = resumoDoProjeto(projeto("usina-solar-residencial-joao"));
    assert.deepEqual(solar.orcamento, { valor: 6_800_000, percentual: 70, estourou: false });
    assert.equal(resumoDoProjeto(projeto("operacao-manutencao-joao")).orcamento, null);
  });

  it("projeto novo, vazio: tudo zero, orçamento a 0%", () => {
    const novo = projeto("carport-solar-joao");
    assert.equal(projetoVazio(novo), true);
    const r = resumoDoProjeto(novo);
    assert.deepEqual([r.recebido, r.aReceber, r.pago, r.aPagar, r.material, r.resultado], [0, 0, 0, 0, 0, 0]);
    assert.equal(r.orcamento?.percentual, 0);
    assert.deepEqual(saidasPorCategoria(novo), []);
  });

  it("um cliente com vários projetos: o João tem três, nas duas empresas, e a soma é a dos três", () => {
    const joao = projetosPorCliente(PROJETOS_DE_EXEMPLO).find((g) => g.cliente.id === "cli-joao")!;
    assert.equal(joao.projetos.length, 3);
    assert.deepEqual([...joao.empresas].sort(), ["plugga", "waze"]);
    assert.equal(joao.resultado, soma(joao.projetos.map((p) => resumoDoProjeto(p).resultado)));
    // Quem tem mais projetos vem primeiro.
    assert.equal(projetosPorCliente(PROJETOS_DE_EXEMPLO)[0]!.cliente.id, "cli-joao");
  });

  it("filtros: empresa, cliente, situação e busca sem acento, inclusive pelo código de origem", () => {
    const ids = (f: Parameters<typeof filtrarProjetos>[1]) => filtrarProjetos(PROJETOS_DE_EXEMPLO, f).map((p) => p.id);
    assert.ok(ids({ visao: "projetos", empresa: "waze" }).every((id) => projeto(id).empresa === "waze"));
    assert.deepEqual(ids({ visao: "projetos", cliente: "cli-joao", situacao: "nao_iniciado" }), ["carport-solar-joao"]);
    assert.deepEqual(ids({ visao: "projetos", busca: "condominio" }), ["usina-solar-condominio"]);
    assert.deepEqual(ids({ visao: "projetos", busca: "pc-0061" }), ["eletroposto-ponto-certo"]);
    assert.deepEqual(ids({ visao: "projetos", busca: "nada assim" }), []);
  });

  it("o endereço guarda os filtros e descarta o que não é válido", () => {
    const filtros = lerFiltrosDosProjetos({ visao: "clientes", empresa: "waze", cliente: "cli-joao", situacao: "em_andamento", busca: "  usina " }, clientesDeExemplo().map((c) => c.id));
    assert.deepEqual(filtros, { visao: "clientes", empresa: "waze", cliente: "cli-joao", situacao: "em_andamento", busca: "usina" });
    assert.equal(hrefDosProjetos(filtros), "/financeiro/centro-de-custo?visao=clientes&empresa=waze&cliente=cli-joao&situacao=em_andamento&busca=usina");
    assert.deepEqual(lerFiltrosDosProjetos({ visao: "quadro", empresa: "outra", cliente: "x", situacao: "toString" }, ["cli-joao"]), { visao: "projetos" });
    assert.equal(hrefDosProjetos({ visao: "projetos" }), "/financeiro/centro-de-custo");
  });

  it("valores em reais, com o sinal de menos no negativo", () => {
    assert.equal(reais(123_456).replace(/\s/g, " "), "R$ 1.234,56");
    assert.equal(reais(-5_000).replace(/\s/g, " "), "− R$ 50,00");
  });
});

describe("os exemplos do Centro de custo não vão ao navegador (PLU-362)", () => {
  // Grafo dos imports relativos de app/: a partir de cada módulo "use client", nenhum caminho chega ao módulo de exemplos.
  const raiz = path.resolve(import.meta.dirname, "../app");
  const EXEMPLOS = path.join(raiz, "lib", "prototipo-centro-de-custo-exemplos.ts");
  const arquivos = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivos(path.join(dir, e.name)) : /\.(tsx?|mjs|js)$/.test(e.name) ? [path.join(dir, e.name)] : []);
  const resolver = (de: string, especificador: string): string | null => {
    const base = path.resolve(path.dirname(de), especificador);
    for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
      if (existsSync(c) && statSync(c).isFile()) return c;
    }
    return null;
  };
  const imports = (arquivo: string): string[] => {
    const texto = readFileSync(arquivo, "utf8");
    const especificadores = [...texto.matchAll(/(?:import|export)\s[^"';]*?from\s*["'](\.[^"']+)["']|import\s*\(\s*["'](\.[^"']+)["']\s*\)|import\s*["'](\.[^"']+)["']/g)]
      .map((m) => m[1] ?? m[2] ?? m[3]!);
    return especificadores.flatMap((e) => { const r = resolver(arquivo, e); return r ? [r] : []; });
  };
  const ehCliente = (arquivo: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(readFileSync(arquivo, "utf8"));

  function caminhoAteOsExemplos(inicio: string): string[] | null {
    const vindo = new Map<string, string | null>([[inicio, null]]);
    const fila = [inicio];
    while (fila.length) {
      const atual = fila.shift()!;
      if (atual === EXEMPLOS) {
        const caminho = [];
        for (let a: string | null = atual; a; a = vindo.get(a) ?? null) caminho.unshift(path.relative(raiz, a));
        return caminho;
      }
      for (const proximo of imports(atual)) if (!vindo.has(proximo)) { vindo.set(proximo, atual); fila.push(proximo); }
    }
    return null;
  }

  it("nenhum módulo \"use client\" importa os exemplos, nem por outro módulo", () => {
    const clientes = arquivos(raiz).filter(ehCliente);
    // Sanidade: o detector acha os componentes cliente do Centro de custo.
    assert.ok(clientes.some((c) => c.endsWith(path.join("financeiro", "centro-de-custo-view.tsx"))));
    for (const cliente of clientes) assert.equal(caminhoAteOsExemplos(cliente), null, path.relative(raiz, cliente));
  });

  it("o detector pega um import indireto (prova do teste)", () => {
    // A página do servidor chega aos exemplos: se o detector não visse isso, o teste acima passaria à toa.
    assert.deepEqual(caminhoAteOsExemplos(path.join(raiz, "financeiro", "centro-de-custo", "page.tsx")), [path.join("financeiro", "centro-de-custo", "page.tsx"), path.join("lib", "prototipo-centro-de-custo-exemplos.ts")]);
  });
});
