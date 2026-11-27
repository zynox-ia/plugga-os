import { describe, expect, it } from "vitest";

import {
  D,
  aceitaEntradaDoPedido,
  coberturaPeloEstoque,
  custoMedioDepoisDaEntrada,
  type LinhaParaCobertura,
  faltaEntrar,
  itemIndisponivelParaOPedido,
  problemaDaEntradaDoPedido,
  type PedidoDaEntrada,
  diaValido,
  origemOuDestino,
  planejarMovimento,
  proximoCodigo,
  saldoParaContrato,
  segundaDaSemana,
  situacaoDoSaldo,
  ultimas8Semanas,
  type SaldoAtual,
} from "./estoque.rules";

const saldo = (emEstoque: string, reservado = "0", custoMedio: string | null = "10"): SaldoAtual => ({
  emEstoque: D(emEstoque),
  reservado: D(reservado),
  custoMedio: custoMedio === null ? null : D(custoMedio),
});

function plano(atual: SaldoAtual, movimento: Parameters<typeof planejarMovimento>[1]) {
  const r = planejarMovimento(atual, movimento);
  if (!r.ok) throw new Error(r.recusa.mensagem);
  return r.resultado;
}
const recusa = (atual: SaldoAtual, movimento: Parameters<typeof planejarMovimento>[1]) => {
  const r = planejarMovimento(atual, movimento);
  if (r.ok) throw new Error("devia recusar");
  return r.recusa;
};

describe("custo médio ponderado", () => {
  it("pondera o estoque atual com a entrada", () => {
    // 10 un a 10,00 + 30 un a 14,00 = 520 / 40 = 13,00
    expect(custoMedioDepoisDaEntrada(D(10), D(10), D(30), D(14)).toFixed(4)).toBe("13.0000");
  });

  it("sem estoque ou sem custo anterior, vale o custo da entrada", () => {
    expect(custoMedioDepoisDaEntrada(D(0), D(99), D(5), D("7.5")).toFixed(4)).toBe("7.5000");
    expect(custoMedioDepoisDaEntrada(D(3), null, D(5), D("7.5")).toFixed(4)).toBe("7.5000");
  });

  it("guarda 4 casas", () => {
    // 1 a 1,00 + 2 a 2,00 = 5 / 3 = 1,6667
    expect(custoMedioDepoisDaEntrada(D(1), D(1), D(2), D(2)).toFixed(4)).toBe("1.6667");
  });
});

describe("planejarMovimento", () => {
  it("entrada soma e recalcula o custo", () => {
    expect(plano(saldo("10"), { tipo: "entrada", quantidade: D(30), custoUnitario: D(14) })).toMatchObject({ emEstoque: D(40), custoMedio: D(13) });
  });

  it("saída não passa do disponível: o reservado não sai", () => {
    expect(plano(saldo("10", "4"), { tipo: "saida", quantidade: D(6) }).emEstoque.toFixed(3)).toBe("4.000");
    expect(recusa(saldo("10", "4"), { tipo: "saida", quantidade: D("6.001") }).campo).toBe("quantidade");
  });

  it("ajuste por diferença ou por saldo contado, nunca abaixo do reservado", () => {
    expect(plano(saldo("10", "3"), { tipo: "ajuste", quantidade: D(-7) })).toMatchObject({ quantidade: D(-7), emEstoque: D(3) });
    expect(plano(saldo("10"), { tipo: "ajuste", saldoContado: D("12.5") })).toMatchObject({ quantidade: D("2.5"), emEstoque: D("12.5") });
    expect(recusa(saldo("10", "3"), { tipo: "ajuste", saldoContado: D(2) }).mensagem).toMatch(/abaixo do reservado/);
    expect(recusa(saldo("10"), { tipo: "ajuste", saldoContado: D(10) }).mensagem).toMatch(/igual ao saldo atual/);
  });

  it("ajuste não mexe no custo médio", () => {
    expect(plano(saldo("10", "0", "12"), { tipo: "ajuste", quantidade: D(5) }).custoMedio).toEqual(D(12));
  });

  it("reserva só do disponível e não muda o estoque", () => {
    expect(plano(saldo("10", "2"), { tipo: "reserva", quantidade: D(8) })).toMatchObject({ emEstoque: D(10), reservado: D(10) });
    expect(recusa(saldo("10", "2"), { tipo: "reserva", quantidade: D(9) }).mensagem).toMatch(/não atende/);
  });

  it("liberação devolve ao disponível", () => {
    expect(plano(saldo("10", "6"), { tipo: "liberacao", quantidade: D(6) })).toMatchObject({ emEstoque: D(10), reservado: D(0) });
    expect(() => plano(saldo("10", "1"), { tipo: "liberacao", quantidade: D(2) })).toThrow();
  });

  it("baixa da reserva vira saída: tira do estoque e do reservado", () => {
    expect(plano(saldo("10", "6"), { tipo: "baixa", quantidade: D(6) })).toMatchObject({ tipo: "saida", emEstoque: D(4), reservado: D(0) });
  });
});

describe("situação e saldo para a tela", () => {
  it("situação pelo disponível", () => {
    expect(situacaoDoSaldo(D(0), D(5))).toBe("zerado");
    expect(situacaoDoSaldo(D(4), D(5))).toBe("abaixo_do_minimo");
    expect(situacaoDoSaldo(D(5), D(5))).toBe("normal");
    expect(situacaoDoSaldo(D(1), D(0))).toBe("normal");
  });

  it("valor pelo custo médio e quanto falta para o mínimo", () => {
    expect(saldoParaContrato({ emEstoque: D(10), reservado: D(4), custoMedio: D("2.5"), estoqueMinimo: D(8) })).toEqual({
      emEstoque: "10.000",
      reservado: "4.000",
      disponivel: "6.000",
      custoMedio: "2.50",
      valor: "25.00",
      situacao: "abaixo_do_minimo",
      faltaParaOMinimo: "2.000",
    });
    expect(saldoParaContrato({ emEstoque: D(0), reservado: D(0), custoMedio: null, estoqueMinimo: D(0) })).toMatchObject({ valor: "0.00", custoMedio: null, situacao: "zerado" });
  });
});

describe("código, semanas e textos", () => {
  it("próximo código pelo maior EST da empresa", () => {
    expect(proximoCodigo([])).toBe("EST-0001");
    expect(proximoCodigo(["EST-0009", "CAB-6MM", "EST-0002"])).toBe("EST-0010");
  });

  it("semana começa na segunda", () => {
    expect(segundaDaSemana("2026-11-23")).toBe("2026-11-23");
    expect(segundaDaSemana("2026-11-29")).toBe("2026-11-23");
    expect(segundaDaSemana("2026-11-30")).toBe("2026-11-30");
  });

  it("8 semanas até a atual, com as vazias", () => {
    const semanas = ultimas8Semanas(
      [
        { tipo: "entrada", data: "2026-11-24", quantidade: D(5) },
        { tipo: "saida", data: "2026-11-23", quantidade: D(2) },
        { tipo: "ajuste", data: "2026-11-23", quantidade: D(1) },
        { tipo: "entrada", data: "2026-09-01", quantidade: D(99) },
      ],
      new Date("2026-11-25T14:00:00Z"),
    );
    expect(semanas).toHaveLength(8);
    expect(semanas[0]!.inicio).toBe("2026-10-05");
    expect(semanas[7]).toEqual({ inicio: "2026-11-23", entradas: "5.000", saidas: "2.000" });
    expect(semanas[6]).toEqual({ inicio: "2026-11-16", entradas: "0.000", saidas: "0.000" });
  });

  it("texto de origem ou destino", () => {
    const base = { origem: null, destino: null, obra: null, cliente: null, area: null, pedido: null };
    expect(origemOuDestino({ ...base, tipo: "entrada", origem: "compra", pedido: { numero: 12 } })).toBe("Compra · PC-0012");
    expect(origemOuDestino({ ...base, tipo: "saida", destino: "obra", obra: { nome: "Subestação" } })).toBe("Obra Subestação");
    expect(origemOuDestino({ ...base, tipo: "saida", destino: "interno", area: "Escritório" })).toBe("Interno · Escritório");
    expect(origemOuDestino({ ...base, tipo: "reserva", pedido: { numero: 3 } })).toBe("Reserva · PC-0003");
    expect(origemOuDestino({ ...base, tipo: "ajuste" })).toBe("Ajuste");
  });

  it("dia futuro não vale", () => {
    const agora = new Date("2026-11-23T14:00:00Z");
    expect(diaValido("2026-11-23", agora)).toBe(true);
    expect(diaValido("2026-11-24", agora)).toBe(false);
  });

  describe("cobertura pelo estoque na análise", () => {
    const item = (id: string, dados: Partial<NonNullable<LinhaParaCobertura["item"]>> = {}) => ({ id, companyId: "plugga", ativo: true, emEstoque: D(10), reservado: D(5), ...dados });
    const textos = (r: ReturnType<typeof coberturaPeloEstoque>) => r.linhas.map((l) => [l.atende.toFixed(3), l.motivo, l.pedidoDoItem?.toFixed(3) ?? null]);

    it("linhas do mesmo item dividem o disponível, na ordem do pedido", () => {
      const r = coberturaPeloEstoque([{ quantidade: D(4), item: item("a") }, { quantidade: D(4), item: item("a") }, { quantidade: D(2), item: item("b") }], "plugga");
      expect(textos(r)).toEqual([["4.000", null, "8.000"], ["1.000", "insuficiente", "8.000"], ["2.000", null, "2.000"]]);
      expect(r.atendeTudo).toBe(false);
    });

    it("item inativo, de outra empresa ou sem vínculo não atende", () => {
      const r = coberturaPeloEstoque([
        { quantidade: D(1), item: item("a", { ativo: false }) },
        { quantidade: D(1), item: item("b", { companyId: "waze" }) },
        { quantidade: D(1), item: null },
      ], "plugga");
      expect(textos(r)).toEqual([["0.000", "inativo", "1.000"], ["0.000", "outra_empresa", null], ["0.000", "sem_vinculo", null]]);
      // Do item de outra empresa não sai nem o disponível.
      expect(r.linhas[1]!.disponivel).toBeNull();
      expect(r.atendeTudo).toBe(false);
    });

    it("a análise e a gravação usam a mesma regra do item", () => {
      const ativo = { companyId: "plugga", ativo: true };
      expect(itemIndisponivelParaOPedido(ativo, { empresa: "plugga", exigirAtivo: true })).toBeNull();
      expect(itemIndisponivelParaOPedido(ativo, { empresa: "waze", exigirAtivo: true })).toBe("outra_empresa");
      expect(itemIndisponivelParaOPedido({ companyId: "waze", ativo: false }, { empresa: "plugga", exigirAtivo: true })).toBe("outra_empresa");
      expect(itemIndisponivelParaOPedido({ ...ativo, ativo: false }, { empresa: "plugga", exigirAtivo: true })).toBe("inativo");
      // Baixa e liberação encerram compromisso: valem com o item inativo.
      expect(itemIndisponivelParaOPedido({ ...ativo, ativo: false }, { exigirAtivo: false })).toBeNull();
    });

    it("atende tudo quando cada item cobre a soma das suas linhas; disponível negativo vira zero", () => {
      expect(coberturaPeloEstoque([{ quantidade: D(2), item: item("a") }, { quantidade: D(3), item: item("a") }], "plugga").atendeTudo).toBe(true);
      const zerado = coberturaPeloEstoque([{ quantidade: D(1), item: item("a", { emEstoque: D(1), reservado: D(1) }) }], "plugga");
      expect([zerado.linhas[0]!.disponivel?.toFixed(3), zerado.linhas[0]!.motivo]).toEqual(["0.000", "insuficiente"]);
      expect(coberturaPeloEstoque([], "plugga").atendeTudo).toBe(false);
    });
  });

  describe("entrada por compra ligada ao pedido", () => {
    const pedido = (dados: Partial<PedidoDaEntrada> = {}): PedidoDaEntrada => ({ numero: 7, cancelado: false, atendidoPeloEstoque: false, pedida: D(10), recebida: D(4), ...dados });

    it("aceita até o que falta do item", () => {
      expect(problemaDaEntradaDoPedido(pedido(), D(6), "m", 7)).toBeNull();
      expect(problemaDaEntradaDoPedido(pedido(), D("6.001"), "m", 7)).toMatchObject({
        campo: "quantidade", estado: true, mensagem: "Este pedido (PC-0007) já deu entrada de 4.000 m deste item, de 10.000 m pedidos.",
      });
    });

    it("recusa pedido sem o item, cancelado ou atendido pelo estoque", () => {
      expect(problemaDaEntradaDoPedido(null, D(1), "m", 12)).toMatchObject({ campo: "pedidoId", estado: false, mensagem: "O pedido PC-0012 não tem este item vinculado ao estoque." });
      expect(problemaDaEntradaDoPedido(pedido({ cancelado: true }), D(1), "m", 7)).toMatchObject({ campo: "pedidoId", estado: true });
      expect(problemaDaEntradaDoPedido(pedido({ atendidoPeloEstoque: true }), D(1), "m", 7)).toMatchObject({ campo: "pedidoId", estado: true });
    });

    it("só aparece na escolha o pedido que ainda aceita entrada", () => {
      expect(aceitaEntradaDoPedido(pedido())).toBe(true);
      expect(aceitaEntradaDoPedido(pedido({ recebida: D(10) }))).toBe(false);
      expect(aceitaEntradaDoPedido(pedido({ cancelado: true }))).toBe(false);
      expect(aceitaEntradaDoPedido(pedido({ atendidoPeloEstoque: true }))).toBe(false);
      expect(faltaEntrar(pedido({ recebida: D(12) })).toFixed(3)).toBe("0.000");
    });
  });
});
