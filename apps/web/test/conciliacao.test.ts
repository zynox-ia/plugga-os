import assert from "node:assert/strict";
import test from "node:test";

import {
  consultaDaConciliacao,
  correcaoDoPar,
  hrefDaConciliacao,
  lerFiltrosDaConciliacao,
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
  assert.deepEqual(correcaoDoPar(par("-1234.56", "1200.00"), true), { valorInicial: "1.234,56" });
  assert.deepEqual(correcaoDoPar(par("80.5", "75.00"), true), { valorInicial: "80,50" });
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
