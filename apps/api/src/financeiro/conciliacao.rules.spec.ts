import { describe, expect, it } from "vitest";

import { montarPainel, problemaDoPar, type LancamentoParaConciliar, type MovimentoParaConciliar } from "./conciliacao.rules";

const CONTA = "c1";
const mov = (id: string, dia: string, valor: string, o: Partial<MovimentoParaConciliar> = {}): MovimentoParaConciliar => ({
  id, contaCorrenteId: CONTA, dia, valor, estado: "pendente", lancamentoId: null, ...o,
});
const lanc = (id: string, tipo: "saida" | "entrada", liquidadoEm: string | null, valorLiquidado: string, o: Partial<LancamentoParaConciliar> = {}): LancamentoParaConciliar => ({
  id, tipo, contaCorrenteId: CONTA, etapa: tipo === "saida" ? "paga" : "recebida", cancelado: false, liquidadoEm, valorLiquidado, ...o,
});
const PERIODO = { de: "2026-11-01", ate: "2026-11-30" };

describe("o par da conciliação (PLU-339, C3): o mesmo valor em qualquer caminho", () => {
  it("vale: saída paga com débito igual, entrada recebida com crédito igual, na mesma conta", () => {
    expect(problemaDoPar(mov("m", "2026-11-21", "-1742.18"), lanc("l", "saida", "2026-11-21", "1742.18"))).toBeNull();
    expect(problemaDoPar(mov("m", "2026-11-14", "7200.00"), lanc("l", "entrada", "2026-11-14", "7200"))).toBeNull();
  });

  it("recusa com a mensagem pronta: valor diferente, outro sentido, outra conta, não liquidado, cancelado, já conciliado", () => {
    expect(problemaDoPar(mov("m", "2026-11-21", "-680.00"), lanc("l", "saida", "2026-11-21", "700.00"))).toBe("Para conciliar, o valor tem de ser igual: extrato R$ 680,00, lançamento R$ 700,00.");
    expect(problemaDoPar(mov("m", "2026-11-21", "680.00"), lanc("l", "saida", "2026-11-21", "680.00"))).toMatch(/débito/);
    expect(problemaDoPar(mov("m", "2026-11-21", "-680.00"), lanc("l", "entrada", "2026-11-21", "680.00"))).toMatch(/crédito/);
    expect(problemaDoPar(mov("m", "2026-11-21", "-680.00"), lanc("l", "saida", "2026-11-21", "680.00", { contaCorrenteId: "c2" }))).toMatch(/outra conta/);
    expect(problemaDoPar(mov("m", "2026-11-21", "-680.00"), lanc("l", "saida", null, "680.00", { etapa: "aprovada" }))).toMatch(/ainda não foi paga/);
    expect(problemaDoPar(mov("m", "2026-11-21", "680.00"), lanc("l", "entrada", null, "680.00", { etapa: "enviada" }))).toMatch(/ainda não foi recebida/);
    expect(problemaDoPar(mov("m", "2026-11-21", "-680.00"), lanc("l", "saida", "2026-11-21", "680.00", { cancelado: true }))).toMatch(/cancelad/);
    expect(problemaDoPar(mov("m", "2026-11-21", "-680.00"), lanc("l", "saida", "2026-11-21", "680.00", { etapa: "conciliada" }))).toMatch(/já está conciliad/);
    expect(problemaDoPar(mov("m", "2026-11-21", "-680.00", { estado: "conciliado", lancamentoId: "x" }), lanc("l", "saida", "2026-11-21", "680.00"))).toMatch(/linha do extrato já está conciliada/);
  });
});

describe("o painel da conciliação", () => {
  it("sugere o par único dos dois lados: mesmo valor, sentido e conta, a até 3 dias", () => {
    const p = montarPainel([mov("m1", "2026-11-21", "-1742.18"), mov("m2", "2026-11-14", "7200.00")], [lanc("l1", "saida", "2026-11-19", "1742.18"), lanc("l2", "entrada", "2026-11-14", "7200.00")], PERIODO);
    expect(p.sugeridos.map(([m, l]) => [m.id, l.id])).toEqual([["m1", "l1"], ["m2", "l2"]]);
    expect([p.valorDiferente, p.semLancamento, p.semExtrato]).toEqual([[], [], []]);
  });

  it("a mais de 3 dias, ou ambíguo (dois candidatos de um lado), não sugere", () => {
    const longe = montarPainel([mov("m1", "2026-11-25", "-50.00")], [lanc("l1", "saida", "2026-11-21", "50.00")], PERIODO);
    expect(longe.sugeridos).toEqual([]);
    const ambiguo = montarPainel([mov("m1", "2026-11-21", "-50.00"), mov("m2", "2026-11-22", "-50.00")], [lanc("l1", "saida", "2026-11-21", "50.00")], PERIODO);
    expect(ambiguo.sugeridos).toEqual([]);
    expect(ambiguo.semLancamento.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(ambiguo.semExtrato.map((l) => l.id)).toEqual(["l1"]);
    // Os candidatos de cada lado, pela mesma regra: com 2 ou mais, a pessoa escolhe.
    expect(ambiguo.candidatos.doLancamento.get("l1")).toEqual(["m1", "m2"]);
    expect(ambiguo.candidatos.doMovimento.get("m1")).toEqual(["l1"]);
    expect(longe.candidatos.doMovimento.get("m1")).toEqual([]);
  });

  it("valor diferente: o único próximo dos dois lados, com a diferença (lançamento menos extrato)", () => {
    const p = montarPainel([mov("m1", "2026-11-21", "-680.00")], [lanc("l1", "saida", "2026-11-21", "700.00")], PERIODO);
    expect(p.valorDiferente.map(([m, l, d]) => [m.id, l.id, d])).toEqual([["m1", "l1", "20.00"]]);
    expect(p.sugeridos).toEqual([]);
  });

  it("o marcado (pendente de ver depois) não é sugerido; o conciliado aparece com o par; o sem extrato é só o do período", () => {
    const p = montarPainel(
      [mov("m1", "2026-11-21", "-10.00", { estado: "marcado" }), mov("m2", "2026-11-10", "-5.00", { estado: "conciliado", lancamentoId: "l2" })],
      [lanc("l1", "saida", "2026-11-21", "10.00"), lanc("l2", "saida", "2026-11-10", "5.00", { etapa: "conciliada" }), lanc("l3", "saida", "2026-10-30", "9.00")],
      PERIODO,
    );
    expect(p.sugeridos).toEqual([]);
    expect(p.semLancamento.map((m) => [m.id, m.estado])).toEqual([["m1", "marcado"]]);
    expect(p.conciliados.map(([m, l]) => [m.id, l.id])).toEqual([["m2", "l2"]]);
    // l3 foi pago antes do período: entra na busca de par, mas não na lista "sem extrato".
    expect(p.semExtrato.map((l) => l.id)).toEqual(["l1"]);
  });

  it("o candidato pode ser um liquidado logo fora do período (a janela): ele não está em semExtrato", () => {
    const p = montarPainel([mov("m1", "2026-11-01", "-9.00"), mov("m2", "2026-11-02", "-9.00")], [lanc("l1", "saida", "2026-10-30", "9.00")], PERIODO);
    expect(p.semExtrato).toEqual([]);
    expect(p.candidatos.doMovimento.get("m1")).toEqual(["l1"]);
  });

  it("cancelado ou não liquidado não entra no painel; o par é sempre da mesma conta, com várias contas no escopo", () => {
    const p = montarPainel([mov("m1", "2026-11-21", "-10.00")], [
      lanc("l1", "saida", "2026-11-21", "10.00", { contaCorrenteId: "c2" }),
      lanc("l2", "saida", "2026-11-21", "10.00", { cancelado: true }),
      lanc("l3", "saida", null, "10.00", { etapa: "aprovada" }),
    ], PERIODO);
    expect(p.sugeridos).toEqual([]);
    expect(p.semExtrato.map((l) => l.id)).toEqual(["l1"]);
    expect(p.semLancamento.map((m) => m.id)).toEqual(["m1"]);
  });

  it("o lançamento marcado (pago que ainda não apareceu no extrato) não é sugerido e fica sem extrato", () => {
    const p = montarPainel([mov("m1", "2026-11-21", "-10.00")], [lanc("l1", "saida", "2026-11-21", "10.00", { marcado: true })], PERIODO);
    expect(p.sugeridos).toEqual([]);
    expect(p.semExtrato.map((l) => l.id)).toEqual(["l1"]);
  });
});
