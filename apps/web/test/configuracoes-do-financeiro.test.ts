import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CategoriaFinanceira, ContaCorrente } from "@plugga/shared";

import {
  camposDaCategoria, camposDaConta, categoriaDasTarifas, comCategoriaSalva, comContaSalva, corpoDaCategoria, corpoDaConta, grupoEditavel,
  mudancasDasTarifas, nomeDoGrupo, opcoesDasTarifas, podeCadastrarNoFinanceiro, saldoDigitado, saldoParaDigitar,
} from "../app/lib/cadastros-do-financeiro.ts";
import { categoriasAgrupadas, contagemDasCategorias, contasDaTela, detalheDaConta, saldoDaConta } from "../app/lib/configuracoes-do-financeiro.ts";

const u = (n: number) => `6f1c2a3b-0000-4000-8000-${String(n).padStart(12, "0")}`;
// `saldo` e `saldoLidoEm` (lidos do OMIE) saem do contrato com a extinção (24/11/2026). Por espalhamento,
// o objeto vale com o contrato de antes e com o de depois; sai daqui junto com os campos.
const conta = (n: number, parcial: Partial<ContaCorrente>): ContaCorrente => ({
  id: u(n), empresa: "plugga", nome: `Conta ${n}`, banco: null, agencia: null, numero: null, ativa: true, ...parcial,
});
const categoria = (n: number, codigo: string, parcial: Partial<CategoriaFinanceira> = {}): CategoriaFinanceira => ({
  id: u(n), empresa: "plugga", codigo, nome: `Categoria ${codigo}`, tipo: "despesa", natureza: "outros",
  grupo: { codigo: codigo.split(".").slice(0, 2).join("."), nome: `Grupo ${codigo.split(".").slice(0, 2).join(".")}` }, ativa: true, ...parcial,
});

describe("contas correntes", () => {
  it("filtra pela empresa e põe as ativas primeiro", () => {
    const opcoes = { contasCorrentes: [conta(1, { nome: "Sicoob", ativa: false }), conta(2, { nome: "Itaú" }), conta(3, { nome: "BB", empresa: "waze" })] };
    assert.deepEqual(contasDaTela(opcoes, "plugga").map((c) => c.nome), ["Itaú", "Sicoob"]);
    assert.deepEqual(contasDaTela(opcoes, null).map((c) => c.nome), ["Itaú", "BB", "Sicoob"]);
  });

  it("o saldo diz por que falta: sem saldo inicial, ou escondido de quem só paga ou só recebe", () => {
    assert.deepEqual(saldoDaConta({ saldoCalculado: "1520.30", saldoInicial: "1000.00" }), { valor: "1520.30", nota: "saldo inicial mais o pago e o recebido" });
    assert.deepEqual(saldoDaConta({ saldoCalculado: null, saldoInicial: "1000.00" }), { valor: null, nota: "visível só para quem acompanha pagar e receber" });
    assert.deepEqual(saldoDaConta({ saldoCalculado: null, saldoInicial: null }), { valor: null, nota: "sem saldo inicial" });
    assert.deepEqual(saldoDaConta({}), { valor: null, nota: "sem saldo inicial" });
  });

  it("o detalhe mostra só o que a conta tem cadastrado", () => {
    assert.equal(detalheDaConta({ banco: "Itaú", agencia: "0412", numero: "23456-7" }), "Itaú · ag 0412 · cc 23456-7");
    assert.equal(detalheDaConta({ banco: "Itaú", agencia: null, numero: null }), "Itaú");
    assert.equal(detalheDaConta({ banco: null, agencia: null, numero: null }), "");
  });
});

describe("categorias", () => {
  const opcoes = { categorias: [categoria(1, "2.01.10"), categoria(2, "1.01.01", { tipo: "receita", nome: "Gestão de energia" }), categoria(3, "2.01.2"), categoria(4, "1.02.01", { empresa: "waze", nome: "Serviços de engenharia" })] };

  it("agrupa pelos dois primeiros níveis do código, na ordem numérica", () => {
    const grupos = categoriasAgrupadas(opcoes, null);
    assert.deepEqual(grupos.map((g) => [g.codigo, g.categorias.map((c) => c.codigo)]), [["1.01", ["1.01.01"]], ["1.02", ["1.02.01"]], ["2.01", ["2.01.2", "2.01.10"]]]);
    assert.equal(contagemDasCategorias(grupos), "4 categorias em 3 grupos");
  });

  it("com as duas empresas, o grupo de mesmo código e nome diferente não leva o nome do outro", () => {
    const plano = { categorias: [
      categoria(5, "2.03.01", { grupo: { codigo: "2.03", nome: "Locações" } }),
      categoria(6, "2.03.01", { empresa: "waze", grupo: { codigo: "2.03", nome: "Aluguéis" } }),
      categoria(7, "2.03.02", { empresa: "waze", grupo: { codigo: "2.03", nome: "Locações" } }),
    ] };
    assert.deepEqual(categoriasAgrupadas(plano, null).map((g) => [g.codigo, g.nome, g.categorias.map((c) => c.id)]),
      [["2.03", "Locações", [u(5), u(7)]], ["2.03", "Aluguéis", [u(6)]]]);
  });

  it("filtra por empresa e busca sem acento por nome, código ou grupo", () => {
    assert.deepEqual(categoriasAgrupadas(opcoes, "waze").map((g) => g.codigo), ["1.02"]);
    assert.deepEqual(categoriasAgrupadas(opcoes, null, "gestao").flatMap((g) => g.categorias.map((c) => c.codigo)), ["1.01.01"]);
    assert.deepEqual(categoriasAgrupadas(opcoes, null, "2.01.").flatMap((g) => g.categorias.map((c) => c.codigo)), ["2.01.2", "2.01.10"]);
    assert.equal(contagemDasCategorias(categoriasAgrupadas(opcoes, null, "nada")), "0 categorias em 0 grupos");
    assert.equal(contagemDasCategorias(categoriasAgrupadas(opcoes, "waze")), "1 categoria em 1 grupo");
  });
});

// ---------------------------------------------------------------- cadastro pela gerência (PLU-340, fatia 6)

describe("quem cadastra", () => {
  const telas = ["financeiro.pagar"] as const;
  it("a gerência do Financeiro com alguma tela do módulo e a plataforma; o membro só lê", () => {
    assert.equal(podeCadastrarNoFinanceiro({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "gerente", telas: [...telas] }] }), true);
    assert.equal(podeCadastrarNoFinanceiro({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "gerente", telas: ["financeiro.fiscal"] }] }), true);
    assert.equal(podeCadastrarNoFinanceiro({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro", telas: [...telas] }] }), false);
    assert.equal(podeCadastrarNoFinanceiro({ plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "gerente", telas: [] }] }), false);
    assert.equal(podeCadastrarNoFinanceiro({ plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "gerente" }] }), false);
    assert.equal(podeCadastrarNoFinanceiro({ plataforma: "admin", departamentos: [] }), true);
    assert.equal(podeCadastrarNoFinanceiro(undefined), false);
  });
});

describe("saldo inicial digitado", () => {
  it("lê o valor em reais, inclusive negativo (cheque especial), e diz quando não entendeu", () => {
    assert.equal(saldoDigitado("1.234,56"), "1234.56");
    assert.equal(saldoDigitado("R$ 1500"), "1500.00");
    assert.equal(saldoDigitado("-200,5"), "-200.50");
    assert.equal(saldoDigitado("−200,00"), "-200.00");
    assert.equal(saldoDigitado("1500.25"), "1500.25");
    assert.equal(saldoDigitado("  "), null);
    assert.equal(saldoDigitado("12,345"), undefined);
    assert.equal(saldoDigitado("abc"), undefined);
  });

  it("volta para o formato de digitar", () => {
    assert.equal(saldoParaDigitar("1234.5"), "1.234,50");
    assert.equal(saldoParaDigitar("-200.00"), "-200,00");
    assert.equal(saldoParaDigitar(null), "");
  });
});

describe("formulário da conta corrente", () => {
  it("a nova conta exige empresa e nome; banco, agência e número são opcionais", () => {
    const vazio = corpoDaConta(camposDaConta());
    assert.equal(vazio.ok, false);
    assert.deepEqual(!vazio.ok && vazio.erros, { empresa: "escolha a empresa da conta.", nome: "informe o nome da conta, com ao menos 2 letras." });
    const r = corpoDaConta({ ...camposDaConta(undefined, "waze"), nome: "  Itaú PJ ", banco: " Itaú ", agencia: "" });
    assert.deepEqual(r, { ok: true, corpo: { empresa: "waze", nome: "Itaú PJ", banco: "Itaú", agencia: null, numero: null } });
  });

  it("o saldo inicial vai com o dia dele, os dois ou nenhum", () => {
    const base = { ...camposDaConta(undefined, "plugga"), nome: "Caixa" };
    const semDia = corpoDaConta({ ...base, saldoInicial: "1.000,00" });
    assert.deepEqual(!semDia.ok && semDia.erros, { saldoInicialEm: "informe o dia do saldo inicial." });
    const semSaldo = corpoDaConta({ ...base, saldoInicialEm: "2026-11-01" });
    assert.deepEqual(!semSaldo.ok && semSaldo.erros, { saldoInicial: "informe o saldo inicial desse dia." });
    const invalido = corpoDaConta({ ...base, saldoInicial: "mil", saldoInicialEm: "2026-11-01" });
    assert.deepEqual(!invalido.ok && invalido.erros, { saldoInicial: "use um valor como 1.500,00 ou -200,00." });
    assert.deepEqual(corpoDaConta({ ...base, saldoInicial: "-200,00", saldoInicialEm: "2026-11-01" }),
      { ok: true, corpo: { empresa: "plugga", nome: "Caixa", banco: null, agencia: null, numero: null, saldoInicial: "-200.00", saldoInicialEm: "2026-11-01" } });
  });

  it("a edição manda só o que mudou, sem a empresa, e o saldo sai com os dois nulos", () => {
    const original = conta(9, { nome: "Itaú", banco: "Itaú", agencia: "0412", saldoInicial: "1000.00", saldoInicialEm: "2026-11-01" });
    const campos = camposDaConta(original);
    assert.deepEqual(campos, { empresa: "plugga", nome: "Itaú", banco: "Itaú", agencia: "0412", numero: "", saldoInicial: "1.000,00", saldoInicialEm: "2026-11-01", ativa: true });
    assert.deepEqual(corpoDaConta(campos, original), { ok: true, corpo: {} });
    assert.deepEqual(corpoDaConta({ ...campos, nome: "Itaú PJ", ativa: false }, original), { ok: true, corpo: { nome: "Itaú PJ", ativa: false } });
    assert.deepEqual(corpoDaConta({ ...campos, agencia: " " }, original), { ok: true, corpo: { agencia: null } });
    assert.deepEqual(corpoDaConta({ ...campos, saldoInicial: "1.000" }, original), { ok: true, corpo: {} });
    assert.deepEqual(corpoDaConta({ ...campos, saldoInicial: "1.200,00" }, original), { ok: true, corpo: { saldoInicial: "1200.00", saldoInicialEm: "2026-11-01" } });
    assert.deepEqual(corpoDaConta({ ...campos, saldoInicial: "", saldoInicialEm: "" }, original), { ok: true, corpo: { saldoInicial: null, saldoInicialEm: null } });
  });
});

describe("formulário da categoria", () => {
  const plano = [
    categoria(11, "2.01.01", { grupo: { codigo: "2.01", nome: "Despesas administrativas" } }),
    categoria(12, "2.01.02", { grupo: { codigo: "2.01", nome: "Despesas administrativas" }, tarifaBancaria: true, natureza: "tarifa" }),
    categoria(13, "1.01.01", { tipo: "receita", natureza: "receita", grupo: { codigo: "1.01", nome: "Receitas" } }),
    categoria(14, "2.01.01", { empresa: "waze", grupo: { codigo: "2.01", nome: "Administrativas" } }),
    categoria(15, "3.01.01", { grupo: { codigo: "3.01", nome: "Investimentos" } }),
  ];

  it("o nome do grupo vem do plano da empresa quando o grupo já existe", () => {
    assert.equal(nomeDoGrupo(plano, "plugga", "2.01.07"), "Despesas administrativas");
    assert.equal(nomeDoGrupo(plano, "waze", "2.01.07"), "Administrativas");
    assert.equal(nomeDoGrupo(plano, "plugga", "2.02.01"), null);
    assert.equal(nomeDoGrupo(plano, "plugga", "2.0"), null);
    assert.equal(nomeDoGrupo(plano, "plugga", "3.01.01", u(15)), null);
  });

  it("a nova categoria valida código, nome, grupo e duplicidade na empresa", () => {
    const vazio = corpoDaCategoria(camposDaCategoria(), plano);
    assert.deepEqual(!vazio.ok && vazio.erros, {
      empresa: "escolha a empresa da categoria.", codigo: "use o formato 2.01.01.", nome: "informe o nome da categoria, com ao menos 2 letras.", grupoNome: "informe o nome do grupo, com ao menos 2 letras.",
    });
    const base = { ...camposDaCategoria(undefined, "plugga"), codigo: "2.01.01", nome: "Correios", grupoNome: "Despesas administrativas" };
    const repetida = corpoDaCategoria(base, plano);
    assert.deepEqual(!repetida.ok && repetida.erros, { codigo: "já existe a categoria 2.01.01 nesta empresa." });
    const outroNome = corpoDaCategoria({ ...base, codigo: "2.01.03", grupoNome: "Administrativo" }, plano);
    assert.deepEqual(!outroNome.ok && outroNome.erros, { grupoNome: "o grupo 2.01 já se chama \"Despesas administrativas\"." });
    assert.deepEqual(corpoDaCategoria({ ...base, codigo: " 2.01.03 " }, plano),
      { ok: true, corpo: { empresa: "plugga", codigo: "2.01.03", nome: "Correios", tipo: "despesa", natureza: "outros", grupoNome: "Despesas administrativas" } });
    assert.deepEqual(corpoDaCategoria({ ...base, empresa: "waze", codigo: "2.02.01", grupoNome: "Pessoal", tarifaBancaria: true }, plano),
      { ok: true, corpo: { empresa: "waze", codigo: "2.02.01", nome: "Correios", tipo: "despesa", natureza: "outros", grupoNome: "Pessoal", tarifaBancaria: true } });
  });

  it("só despesa ativa pode ser a das tarifas bancárias", () => {
    const receita = corpoDaCategoria({ ...camposDaCategoria(undefined, "plugga"), codigo: "1.01.02", nome: "Juros", tipo: "receita", natureza: "receita", grupoNome: "Receitas", tarifaBancaria: true }, plano);
    assert.deepEqual(!receita.ok && receita.erros, { tarifaBancaria: "só uma categoria de despesa pode ser a das tarifas bancárias." });
    const original = plano[0]!;
    const inativa = corpoDaCategoria({ ...camposDaCategoria(original), ativa: false, tarifaBancaria: true }, plano, original);
    assert.deepEqual(!inativa.ok && inativa.erros, { tarifaBancaria: "categoria inativa não pode ser a das tarifas bancárias." });
  });

  it("a edição manda só nome, natureza, grupo, situação e a marca das tarifas que mudaram", () => {
    const original = plano[1]!;
    const campos = camposDaCategoria(original);
    assert.deepEqual(campos, { empresa: "plugga", codigo: "2.01.02", nome: "Categoria 2.01.02", tipo: "despesa", natureza: "tarifa", grupoNome: "Despesas administrativas", ativa: true, tarifaBancaria: true });
    assert.deepEqual(corpoDaCategoria(campos, plano, original), { ok: true, corpo: {} });
    assert.deepEqual(corpoDaCategoria({ ...campos, nome: "Tarifas", natureza: "servico", tarifaBancaria: false }, plano, original),
      { ok: true, corpo: { nome: "Tarifas", natureza: "servico", tarifaBancaria: false } });
    // Inativar a marcada: a API tira a marca; a tela manda só a situação.
    assert.deepEqual(corpoDaCategoria({ ...campos, ativa: false, tarifaBancaria: false }, plano, original), { ok: true, corpo: { ativa: false } });
  });

  it("renomear o grupo só vale para a categoria que está sozinha nele", () => {
    const comOutras = corpoDaCategoria({ ...camposDaCategoria(plano[0]), grupoNome: "Administrativo" }, plano, plano[0]);
    assert.deepEqual(!comOutras.ok && comOutras.erros, { grupoNome: "o nome do grupo vale para todas as categorias do 2.01; renomear o grupo inteiro ainda não está disponível." });
    assert.deepEqual(corpoDaCategoria({ ...camposDaCategoria(plano[4]), grupoNome: "Investimentos e obras" }, plano, plano[4]), { ok: true, corpo: { grupoNome: "Investimentos e obras" } });
    assert.equal(grupoEditavel(plano, plano[0]!), false);
    assert.equal(grupoEditavel(plano, plano[4]!), true);
  });
});

describe("categoria das tarifas bancárias por empresa", () => {
  const plano = [
    categoria(21, "2.01.05", { nome: "Serviços bancários" }),
    categoria(22, "2.01.02", { nome: "Tarifas", tarifaBancaria: true }),
    categoria(23, "2.01.09", { nome: "Antiga", ativa: false }),
    categoria(24, "1.01.01", { tipo: "receita", nome: "Juros" }),
    categoria(25, "2.01.02", { empresa: "waze", nome: "Tarifas da Waze" }),
  ];

  it("mostra a marcada e oferece só as despesas ativas da empresa, pelo código", () => {
    assert.equal(categoriaDasTarifas(plano, "plugga")?.id, u(22));
    assert.equal(categoriaDasTarifas(plano, "waze"), null);
    assert.deepEqual(opcoesDasTarifas(plano, "plugga").map((c) => c.nome), ["Tarifas", "Serviços bancários"]);
    assert.deepEqual(opcoesDasTarifas(plano, "waze").map((c) => c.nome), ["Tarifas da Waze"]);
  });

  it("a troca marca a nova (a API desmarca a anterior); \"nenhuma\" desmarca a atual; igual não manda nada", () => {
    assert.deepEqual(mudancasDasTarifas(plano, { plugga: u(21), waze: u(25) }), [{ id: u(21), corpo: { tarifaBancaria: true } }, { id: u(25), corpo: { tarifaBancaria: true } }]);
    assert.deepEqual(mudancasDasTarifas(plano, { plugga: "" }), [{ id: u(22), corpo: { tarifaBancaria: false } }]);
    assert.deepEqual(mudancasDasTarifas(plano, { plugga: u(22), waze: "" }), []);
  });
});

describe("a lista depois de salvar", () => {
  it("a categoria salva entra no lugar, a desmarcada perde a marca, e o agrupamento e a contagem seguem", () => {
    const plano = [categoria(31, "2.01.01", { tarifaBancaria: true }), categoria(32, "2.01.02")];
    const salva = { ...categoria(32, "2.01.02", { nome: "Tarifas novas", tarifaBancaria: true }), desmarcada: { id: u(31), codigo: "2.01.01", nome: "Categoria 2.01.01" } };
    const depois = comCategoriaSalva(plano, salva);
    assert.deepEqual(depois.map((c) => [c.id, c.nome, c.tarifaBancaria]), [[u(31), "Categoria 2.01.01", false], [u(32), "Tarifas novas", true]]);
    assert.equal("desmarcada" in depois[1]!, false);
    const nova = comCategoriaSalva(depois, categoria(33, "2.02.01", { grupo: { codigo: "2.02", nome: "Pessoal" } }));
    assert.equal(contagemDasCategorias(categoriasAgrupadas({ categorias: nova }, null)), "3 categorias em 2 grupos");
    assert.deepEqual(categoriasAgrupadas({ categorias: nova }, null, "tarifas").flatMap((g) => g.categorias.map((c) => c.id)), [u(32)]);
  });

  it("a conta salva entra no lugar e só guarda o saldo calculado se o saldo inicial não mudou", () => {
    const contas = [conta(41, { nome: "Itaú", saldoInicial: "1000.00", saldoInicialEm: "2026-11-01", saldoCalculado: "1500.00" })];
    assert.deepEqual(comContaSalva(contas, conta(41, { nome: "Itaú PJ", saldoInicial: "1000.00", saldoInicialEm: "2026-11-01" })).map((c) => [c.nome, c.saldoCalculado]), [["Itaú PJ", "1500.00"]]);
    assert.deepEqual(comContaSalva(contas, conta(41, { saldoInicial: "2000.00", saldoInicialEm: "2026-11-01" })).map((c) => c.saldoCalculado), [null]);
    assert.deepEqual(contasDaTela({ contasCorrentes: comContaSalva(contas, conta(42, { nome: "Caixa", empresa: "waze" })) }, "waze").map((c) => c.nome), ["Caixa"]);
  });
});
