import type { EtapaDeLancamento } from "@plugga/shared";

/**
 * As regras da conciliação (PLU-339, C3), puras: o par entre a linha do extrato bancário
 * e o lançamento do Plugga OS, e o painel (sugeridos, valor diferente, sem par). A regra
 * de ouro: conciliar exige o mesmo valor, em qualquer caminho.
 */

export type MovimentoParaConciliar = {
  id: string;
  contaCorrenteId: string;
  /** AAAA-MM-DD. */
  dia: string;
  /** Com sinal: + crédito, − débito. */
  valor: string;
  estado: "pendente" | "conciliado" | "marcado";
  lancamentoId: string | null;
};

export type LancamentoParaConciliar = {
  id: string;
  tipo: "saida" | "entrada";
  contaCorrenteId: string | null;
  etapa: EtapaDeLancamento;
  cancelado: boolean;
  /** AAAA-MM-DD; nulo antes de pagar ou receber. */
  liquidadoEm: string | null;
  /** O que saiu ou entrou de fato, sem sinal (na entrada, o recebido). */
  valorLiquidado: string;
  /** "Marcar pendente" do lado do lançamento: o pago que ainda não apareceu no extrato. Não é sugerido. */
  marcado?: boolean;
};

/** A janela de dias, para mais ou para menos, entre o extrato e o pagamento (decisão conservadora, levada ao André). */
export const JANELA_DA_SUGESTAO_DIAS = 3;

const centavos = (valor: string): bigint => {
  const [inteiro, fracao = ""] = valor.replace("-", "").split(".");
  const absoluto = BigInt(inteiro || "0") * 100n + BigInt((fracao + "00").slice(0, 2));
  return valor.startsWith("-") ? -absoluto : absoluto;
};
const absoluto = (c: bigint): bigint => (c < 0n ? -c : c);
const emReais = (c: bigint): string => {
  const a = absoluto(c);
  const inteiro = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${inteiro},${(a % 100n).toString().padStart(2, "0")}`;
};
const comDuasCasas = (c: bigint): string => `${c < 0n ? "-" : ""}${(absoluto(c) / 100n).toString()}.${(absoluto(c) % 100n).toString().padStart(2, "0")}`;
const diasEntre = (a: string, b: string): number => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
const liquidado = (l: LancamentoParaConciliar) => (l.tipo === "saida" ? l.etapa === "paga" : l.etapa === "recebida");
/** O sentido certo: a saída é débito no extrato; a entrada, crédito. */
const mesmoSentido = (m: MovimentoParaConciliar, l: LancamentoParaConciliar) => (l.tipo === "saida" ? centavos(m.valor) < 0n : centavos(m.valor) > 0n);

/** Por que este par não concilia, com a mensagem para a pessoa; nulo se concilia. */
export function problemaDoPar(m: MovimentoParaConciliar, l: LancamentoParaConciliar): string | null {
  if (m.estado === "conciliado") return "Esta linha do extrato já está conciliada.";
  if (l.cancelado) return "O lançamento está cancelado.";
  if (l.etapa === "conciliada") return "O lançamento já está conciliado com outra linha do extrato.";
  if (!liquidado(l)) return l.tipo === "saida" ? "A conta ainda não foi paga: registre o pagamento antes de conciliar." : "A cobrança ainda não foi recebida: registre o recebimento antes de conciliar.";
  if (l.contaCorrenteId !== m.contaCorrenteId) return "O lançamento foi pago ou recebido em outra conta corrente.";
  if (!mesmoSentido(m, l)) return l.tipo === "saida" ? "Uma conta a pagar concilia com um débito do extrato." : "Uma cobrança concilia com um crédito do extrato.";
  const extrato = absoluto(centavos(m.valor));
  const doLancamento = centavos(l.valorLiquidado);
  if (extrato !== doLancamento) return `Para conciliar, o valor tem de ser igual: extrato ${emReais(extrato)}, lançamento ${emReais(doLancamento)}.`;
  return null;
}

export type PainelDaConciliacao = {
  sugeridos: [MovimentoParaConciliar, LancamentoParaConciliar][];
  /** Com a diferença: o lançamento menos o extrato, com sinal. */
  valorDiferente: [MovimentoParaConciliar, LancamentoParaConciliar, string][];
  semLancamento: MovimentoParaConciliar[];
  semExtrato: LancamentoParaConciliar[];
  conciliados: [MovimentoParaConciliar, LancamentoParaConciliar][];
};

/**
 * O painel de uma conta num período. Os lançamentos podem vir de um pouco antes e depois
 * do período (a janela da sugestão); "sem extrato" é só o do período. Sugere e aponta
 * valor diferente só quando o par é único dos dois lados: o ambíguo fica para a pessoa.
 */
export function montarPainel(
  movimentos: readonly MovimentoParaConciliar[],
  lancamentos: readonly LancamentoParaConciliar[],
  periodo: { de: string; ate: string },
): PainelDaConciliacao {
  const porId = new Map(lancamentos.map((l) => [l.id, l]));
  const conciliados = movimentos
    .filter((m) => m.estado === "conciliado" && m.lancamentoId && porId.has(m.lancamentoId))
    .map((m): [MovimentoParaConciliar, LancamentoParaConciliar] => [m, porId.get(m.lancamentoId!)!]);
  const movLivres = movimentos.filter((m) => m.estado !== "conciliado");
  // Uma conta ou todas as do escopo: o par é sempre da mesma conta.
  const lancLivres = lancamentos.filter((l) => !l.cancelado && liquidado(l) && l.liquidadoEm !== null && l.contaCorrenteId !== null);
  const perto = (m: MovimentoParaConciliar, l: LancamentoParaConciliar) =>
    l.contaCorrenteId === m.contaCorrenteId && mesmoSentido(m, l) && diasEntre(m.dia, l.liquidadoEm!) <= JANELA_DA_SUGESTAO_DIAS;
  const igual = (m: MovimentoParaConciliar, l: LancamentoParaConciliar) => absoluto(centavos(m.valor)) === centavos(l.valorLiquidado);

  const usadosM = new Set<string>();
  const usadosL = new Set<string>();
  const unico = (criterio: (m: MovimentoParaConciliar, l: LancamentoParaConciliar) => boolean, sugerivel: (m: MovimentoParaConciliar) => boolean) => {
    const pares: [MovimentoParaConciliar, LancamentoParaConciliar][] = [];
    for (const m of movLivres) {
      if (usadosM.has(m.id) || !sugerivel(m)) continue;
      const candidatos = lancLivres.filter((l) => !usadosL.has(l.id) && !l.marcado && criterio(m, l));
      if (candidatos.length !== 1) continue;
      const l = candidatos[0]!;
      const deVolta = movLivres.filter((x) => !usadosM.has(x.id) && sugerivel(x) && criterio(x, l));
      if (deVolta.length !== 1) continue;
      pares.push([m, l]);
    }
    for (const [m, l] of pares) { usadosM.add(m.id); usadosL.add(l.id); }
    return pares;
  };
  // O marcado ("pendente de ver depois") não é sugerido.
  const sugeridos = unico((m, l) => perto(m, l) && igual(m, l), (m) => m.estado === "pendente");
  const valorDiferente = unico((m, l) => perto(m, l) && !igual(m, l), (m) => m.estado === "pendente")
    .map(([m, l]): [MovimentoParaConciliar, LancamentoParaConciliar, string] => [m, l, comDuasCasas(centavos(l.valorLiquidado) - absoluto(centavos(m.valor)))]);

  return {
    sugeridos,
    valorDiferente,
    semLancamento: movLivres.filter((m) => !usadosM.has(m.id)),
    semExtrato: lancLivres.filter((l) => !usadosL.has(l.id) && l.liquidadoEm! >= periodo.de && l.liquidadoEm! <= periodo.ate),
    conciliados,
  };
}
