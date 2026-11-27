import assert from "node:assert/strict";
import test from "node:test";

import {
  consultaDaConciliacao,
  corpoDaCriacao,
  corpoDaTransferencia,
  correcaoDoPar,
  efeitoDaCriacao,
  efeitoDaTransferencia,
  escopoDoSaldo,
  hrefDaConciliacao,
  lerFiltrosDaConciliacao,
  notaDosSaldos,
  opcoesDeCriacao,
  periodoAceito,
  periodoDoMes,
  problemaDoMotivo,
  saldosDaConciliacao,
  semParDoResumo,
} from "../app/lib/conciliacao.ts";

const HOJE = "2026-11-26";

test("o período padrão é o mês corrente até hoje", () => {
  assert.deepEqual(periodoDoMes(HOJE), { de: "2026-11-01", ate: HOJE });
  assert.equal(periodoAceito("2026-11-01", HOJE), true);
  assert.equal(periodoAceito("2026-11-26", "2026-11-01"), false);
  assert.equal(periodoAceito("2024-01-01", "2026-01-01"), false);
});

test("filtro inválido cai no mês, e o endereço leva conta, empresa e aba", () => {
  const filtros = lerFiltrosDaConciliacao({ de: "ontem", ate: "2026-11-20", empresa: "waze", conta: "nao-uuid", aba: "conciliados" }, HOJE);
  assert.equal(filtros.de, "2026-11-01");
  assert.equal(filtros.ate, "2026-11-20");
  assert.equal(filtros.empresa, "waze");
  assert.equal(filtros.conta, undefined);
  assert.equal(filtros.aba, "conciliados");
  assert.equal(hrefDaConciliacao({ ...filtros, conta: "11111111-1111-4111-8111-111111111111" }), "/financeiro/conciliacao?empresa=waze&conta=11111111-1111-4111-8111-111111111111&de=2026-11-01&ate=2026-11-20&aba=conciliados");
  assert.deepEqual(consultaDaConciliacao(filtros), { de: "2026-11-01", ate: "2026-11-20", empresa: "waze" });
});

const conta = (saldoCalculado: string | null, saldoConciliado: string | null, saldoInicial: string | null = saldoCalculado === null ? null : "0.00") => ({ saldoCalculado, saldoConciliado, saldoInicial });

test("o saldo conciliado e a diferença somam em centavos as contas do escopo", () => {
  assert.deepEqual(saldosDaConciliacao([conta("1000.10", "900.05"), conta("-50.20", "-50.20")]), {
    tipo: "calculado", calculado: "949.90", conciliado: "849.85", diferenca: "100.05", semSaldo: 0,
  });
  // 0,1 + 0,2 em float daria 0,30000000000000004: em centavos, não.
  assert.deepEqual(saldosDaConciliacao([conta("0.10", "0.00"), conta("0.20", "0.00")]), {
    tipo: "calculado", calculado: "0.30", conciliado: "0.00", diferenca: "0.30", semSaldo: 0,
  });
});

test("a diferença negativa mantém o sinal, e a conta sem saldo inicial fica de fora da soma", () => {
  const saldos = saldosDaConciliacao([conta("100.00", "250.50"), conta(null, null)]);
  assert.deepEqual(saldos, { tipo: "calculado", calculado: "100.00", conciliado: "250.50", diferenca: "-150.50", semSaldo: 1 });
});

test("sem saldo calculado em nenhuma conta, diz se é falta de saldo inicial ou acesso", () => {
  assert.deepEqual(saldosDaConciliacao([conta(null, null)]), { tipo: "sem-saldo-inicial" });
  // Com saldo inicial e sem o calculado, a API escondeu (quem só acompanha pagar ou receber).
  assert.deepEqual(saldosDaConciliacao([conta(null, null, "500.00")]), { tipo: "oculto" });
  assert.equal(saldosDaConciliacao([]), null);
});

test("sem par conta as duas pontas: o extrato sem lançamento e o lançamento sem extrato", () => {
  assert.deepEqual(semParDoResumo({ semLancamento: 2, semExtrato: 1 }), { total: 3, detalhe: "2 no extrato · 1 no Plugga OS" });
  assert.deepEqual(semParDoResumo({ semLancamento: 0, semExtrato: 0 }), { total: 0, detalhe: "nada sem par" });
});

const par = (movimento: string, lancamento: string, transferencia?: boolean) => ({
  movimento: { valor: movimento },
  lancamento: { valor: lancamento, ...(transferencia === undefined ? {} : { transferencia }) },
});

test("Corrigir no valor diferente é da gerência e já traz o valor do extrato", () => {
  assert.deepEqual(correcaoDoPar(par("-1234.56", "1200.00"), true), { valorInicial: "1.234,56", valorAtual: "1200.00" });
  assert.deepEqual(correcaoDoPar(par("80.5", "75.00"), true), { valorInicial: "80,50", valorAtual: "75.00" });
  assert.equal(correcaoDoPar(par("-1234.56", "1200.00"), false), null);
});

test("a perna de uma transferência não se corrige pelo par: as duas pontas têm o mesmo valor", () => {
  assert.equal(correcaoDoPar(par("-300.00", "250.00", true), true), null);
});

test("desfazer pede o motivo com pelo menos 3 letras, como a API", () => {
  assert.equal(problemaDoMotivo("  "), "informe o motivo, com pelo menos 3 letras.");
  assert.equal(problemaDoMotivo(" ok "), "informe o motivo, com pelo menos 3 letras.");
  assert.equal(problemaDoMotivo("x".repeat(501)), "use até 500 caracteres.");
  assert.equal(problemaDoMotivo(" Par errado "), null);
});

const MOV = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const debito = { id: MOV, valor: "-800.00", dia: "2026-11-26", descricao: "TRANSF ENTRE CONTAS" };
const credito = { id: MOV, valor: "1250.00", dia: "2026-11-26", descricao: "TED RECEBIDA" };

test("a linha sem par oferece receita no crédito e despesa no débito; transferência e despesa são da gerência", () => {
  assert.deepEqual(opcoesDeCriacao(credito, false, 1), ["receita"]);
  assert.deepEqual(opcoesDeCriacao(credito, true, 1), ["receita", "transferencia"]);
  assert.deepEqual(opcoesDeCriacao(debito, true, 2), ["despesa", "transferencia"]);
  // Sem outra conta ativa da mesma empresa, não há para onde transferir.
  assert.deepEqual(opcoesDeCriacao(debito, true, 0), ["despesa"]);
  // A despesa nasce paga sem a aprovação F2: quem não é gerente não cria pelo débito.
  assert.deepEqual(opcoesDeCriacao(debito, false, 2), []);
});

const vazio = { descricao: "", valor: "", clienteId: "", fornecedorId: "", categoriaId: "", competencia: "", forma: "" } as const;

test("a receita guiada pede cliente, categoria e descrição; com o valor da linha, concilia", () => {
  assert.deepEqual(corpoDaCriacao("receita", { ...vazio, valor: "1.250,00" }, credito).porCampo, {
    clienteId: "escolha o cliente.", categoriaId: "escolha a categoria de receita.", descricao: "informe a descrição.",
  });
  const { corpo, conciliar } = corpoDaCriacao("receita", { ...vazio, descricao: " TED do cliente ", valor: "1.250,00", clienteId: ID, categoriaId: ID, competencia: "2026-10" }, credito);
  assert.equal(conciliar, true);
  assert.deepEqual(corpo, { tipo: "entrada", movimentoId: MOV, descricao: "TED do cliente", clienteId: ID, categoriaId: ID, competencia: "2026-10", conciliar: true });
});

test("a despesa guiada só exige o fornecedor; com outro valor, nasce paga sem conciliar", () => {
  assert.deepEqual(corpoDaCriacao("despesa", { ...vazio, descricao: "Aluguel", valor: "800,00" }, debito).porCampo, { fornecedorId: "escolha o fornecedor." });
  const { corpo, conciliar } = corpoDaCriacao("despesa", { ...vazio, descricao: "Aluguel", valor: "780,00", fornecedorId: ID, forma: "pix" }, debito);
  assert.equal(conciliar, false);
  assert.deepEqual(corpo, { tipo: "saida", movimentoId: MOV, descricao: "Aluguel", fornecedorId: ID, forma: "pix", valor: "780.00", conciliar: false });
  assert.equal(corpoDaCriacao("despesa", { ...vazio, descricao: "Aluguel", valor: "0", fornecedorId: ID }, debito).porCampo.valor, "informe o valor, como 1.234,56.");
});

/** O Intl separa "R$" do número com espaço que não quebra. */
const sp = (texto: string | null) => texto?.replace(/\u00a0/g, " ") ?? null;

test("o efeito explica o que muda: criar e conciliar, ou criar sem conciliar", () => {
  assert.equal(sp(efeitoDaCriacao("receita", true, "1250.00")), "Nasce recebida no dia e na conta da linha, e já fica conciliada com ela.");
  assert.equal(
    sp(efeitoDaCriacao("despesa", false, "800.00")),
    "O valor é diferente do extrato (R$ 800,00): a conta nasce paga com o valor digitado e entra no saldo no Plugga OS, mas a linha do extrato continua sem par e o saldo conciliado não muda.",
  );
});

test("a transferência da linha leva a outra conta, e o débito sai da conta da linha", () => {
  assert.deepEqual(corpoDaTransferencia({ outraContaId: "", descricao: "" }, debito).porCampo, { outraContaId: "escolha a outra conta." });
  assert.deepEqual(corpoDaTransferencia({ outraContaId: ID, descricao: "  " }, debito).corpo, { movimentoId: MOV, outraContaId: ID });
  assert.equal(sp(efeitoDaTransferencia(debito, "Itaú · Plugga", "Sicoob · Plugga")),
    "R$ 800,00 saem de Itaú · Plugga e entram em Sicoob · Plugga, no dia 26/11. A perna desta linha fica conciliada; a de Sicoob · Plugga espera o extrato daquela conta.");
  assert.equal(sp(efeitoDaTransferencia(credito, "Itaú · Plugga", "Sicoob · Plugga")),
    "R$ 1.250,00 saem de Sicoob · Plugga e entram em Itaú · Plugga, no dia 26/11. A perna desta linha fica conciliada; a de Sicoob · Plugga espera o extrato daquela conta.");
});

const C = (id: string, empresa: "plugga" | "waze", ativa = true) => ({ id, empresa, ativa, nome: `Conta ${id}`, saldoCalculado: "10.00", saldoConciliado: "10.00", saldoInicial: "0.00" });
const contasDoSeed = [C("a", "plugga"), C("b", "plugga"), C("c", "waze"), C("d", "plugga", false)];

test("com conta no filtro, o saldo é só o dela: inativa, inexistente ou de outra empresa não caem nas outras", () => {
  assert.deepEqual(escopoDoSaldo(contasDoSeed, { conta: "a" }), { tipo: "contas", contas: [contasDoSeed[0]], conta: contasDoSeed[0] });
  assert.deepEqual(escopoDoSaldo(contasDoSeed, { conta: "d" }), { tipo: "fora", motivo: "inativa", conta: contasDoSeed[3] });
  assert.deepEqual(escopoDoSaldo(contasDoSeed, { conta: "zz" }), { tipo: "fora", motivo: "inexistente", conta: null });
  assert.deepEqual(escopoDoSaldo(contasDoSeed, { conta: "c", empresa: "plugga" }), { tipo: "fora", motivo: "outra-empresa", conta: contasDoSeed[2] });
});

test("sem conta no filtro, o saldo soma as ativas da empresa (ou das duas)", () => {
  assert.deepEqual(escopoDoSaldo(contasDoSeed, { empresa: "plugga" }), { tipo: "contas", contas: [contasDoSeed[0], contasDoSeed[1]], conta: null });
  assert.equal((escopoDoSaldo(contasDoSeed, {}) as { contas: unknown[] }).contas.length, 3);
});

test("diferença zero não é prova de conciliação: a nota diz que é líquida e nunca afirma que tudo foi conferido", () => {
  const nota = notaDosSaldos({ tipo: "calculado", calculado: "100.00", conciliado: "100.00", diferenca: "0.00", semSaldo: 1 });
  assert.match(nota, /líquida/);
  assert.match(nota, /se compensam/);
  assert.doesNotMatch(nota, /todo|tudo/i);
  assert.match(nota, /1 conta sem saldo inicial ficou fora da soma\./);
});

test("Corrigir compara com o valor liquidado do par: na cobrança recebida a menor, é o recebido", () => {
  // Cobrada por R$ 100, recebida por R$ 90, e o extrato diz R$ 100: voltar a R$ 100 vale.
  assert.deepEqual(correcaoDoPar(par("100.00", "90.00"), true), { valorInicial: "100,00", valorAtual: "90.00" });
});
