import { Prisma } from "@prisma/client";
import type { SituacaoDoSaldo } from "@plugga/shared";

import { diaEmManaus } from "../compras/dias-uteis";

/**
 * Regras do estoque (PLU-332), puras: dado o saldo do item e a movimentação,
 * devolvem o novo saldo e o custo médio, ou o motivo da recusa. Nada aqui lê
 * banco ou relógio. Quantidade com 3 casas; custo médio com 4.
 */

export const D = (valor: Prisma.Decimal.Value) => new Prisma.Decimal(valor);
const ZERO = D(0);

export type SaldoAtual = { emEstoque: Prisma.Decimal; reservado: Prisma.Decimal; custoMedio: Prisma.Decimal | null };

/** O que uma movimentação faz no saldo. `baixa` é a saída que consome uma reserva (recebimento do pedido). */
export type MovimentoPlanejado =
  | { tipo: "entrada"; quantidade: Prisma.Decimal; custoUnitario: Prisma.Decimal }
  | { tipo: "saida"; quantidade: Prisma.Decimal }
  | { tipo: "ajuste"; quantidade?: Prisma.Decimal; saldoContado?: Prisma.Decimal }
  | { tipo: "reserva"; quantidade: Prisma.Decimal }
  | { tipo: "liberacao"; quantidade: Prisma.Decimal }
  | { tipo: "baixa"; quantidade: Prisma.Decimal };

export type ResultadoDoMovimento = {
  /** Tipo gravado: a baixa é gravada como `saida`. */
  tipo: "entrada" | "saida" | "ajuste" | "reserva" | "liberacao";
  /** Quantidade gravada: positiva, ou com sinal no ajuste. */
  quantidade: Prisma.Decimal;
  emEstoque: Prisma.Decimal;
  reservado: Prisma.Decimal;
  custoMedio: Prisma.Decimal | null;
  /** Custo médio usado para valorar a saída e o ajuste. */
  custoMedioNoMomento: Prisma.Decimal | null;
};

export type Recusa = { mensagem: string; campo?: string };

const quatroCasas = (valor: Prisma.Decimal) => valor.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

/**
 * Custo médio ponderado: (estoque × custo atual + entrada × custo da entrada) ÷
 * estoque novo. Sem estoque (ou sem custo anterior), vale o custo da entrada.
 */
export function custoMedioDepoisDaEntrada(emEstoque: Prisma.Decimal, custoAtual: Prisma.Decimal | null, quantidade: Prisma.Decimal, custoUnitario: Prisma.Decimal): Prisma.Decimal {
  if (emEstoque.lte(0) || custoAtual === null) return quatroCasas(custoUnitario);
  return quatroCasas(emEstoque.mul(custoAtual).add(quantidade.mul(custoUnitario)).div(emEstoque.add(quantidade)));
}

export function planejarMovimento(saldo: SaldoAtual, movimento: MovimentoPlanejado): { ok: true; resultado: ResultadoDoMovimento } | { ok: false; recusa: Recusa } {
  const disponivel = saldo.emEstoque.sub(saldo.reservado);
  const recusa = (mensagem: string, campo?: string) => ({ ok: false as const, recusa: { mensagem, campo } });
  const ok = (resultado: ResultadoDoMovimento) => ({ ok: true as const, resultado });

  switch (movimento.tipo) {
    case "entrada":
      return ok({
        tipo: "entrada",
        quantidade: movimento.quantidade,
        emEstoque: saldo.emEstoque.add(movimento.quantidade),
        reservado: saldo.reservado,
        custoMedio: custoMedioDepoisDaEntrada(saldo.emEstoque, saldo.custoMedio, movimento.quantidade, movimento.custoUnitario),
        custoMedioNoMomento: saldo.custoMedio,
      });
    case "saida":
      if (movimento.quantidade.gt(disponivel)) {
        return recusa(`A saída passa do disponível (${disponivel.toFixed(3)}). O que está reservado não sai.`, "quantidade");
      }
      return ok({ tipo: "saida", quantidade: movimento.quantidade, emEstoque: saldo.emEstoque.sub(movimento.quantidade), reservado: saldo.reservado, custoMedio: saldo.custoMedio, custoMedioNoMomento: saldo.custoMedio });
    case "ajuste": {
      const diferenca = movimento.saldoContado !== undefined ? movimento.saldoContado.sub(saldo.emEstoque) : movimento.quantidade ?? ZERO;
      if (diferenca.isZero()) return recusa("O saldo contado é igual ao saldo atual: não há o que ajustar.", "saldoContado");
      const novo = saldo.emEstoque.add(diferenca);
      if (novo.lt(saldo.reservado)) {
        return recusa(`O ajuste deixaria o estoque abaixo do reservado (${saldo.reservado.toFixed(3)}). Libere a reserva antes.`, "quantidade");
      }
      return ok({ tipo: "ajuste", quantidade: diferenca, emEstoque: novo, reservado: saldo.reservado, custoMedio: saldo.custoMedio, custoMedioNoMomento: saldo.custoMedio });
    }
    case "reserva":
      if (movimento.quantidade.gt(disponivel)) return recusa(`O disponível (${disponivel.toFixed(3)}) não atende a reserva.`, "quantidade");
      return ok({ tipo: "reserva", quantidade: movimento.quantidade, emEstoque: saldo.emEstoque, reservado: saldo.reservado.add(movimento.quantidade), custoMedio: saldo.custoMedio, custoMedioNoMomento: saldo.custoMedio });
    case "liberacao":
      if (movimento.quantidade.gt(saldo.reservado)) return recusa("A liberação passa do reservado.");
      return ok({ tipo: "liberacao", quantidade: movimento.quantidade, emEstoque: saldo.emEstoque, reservado: saldo.reservado.sub(movimento.quantidade), custoMedio: saldo.custoMedio, custoMedioNoMomento: saldo.custoMedio });
    case "baixa":
      if (movimento.quantidade.gt(saldo.reservado) || movimento.quantidade.gt(saldo.emEstoque)) return recusa("A baixa passa do reservado.");
      return ok({
        tipo: "saida",
        quantidade: movimento.quantidade,
        emEstoque: saldo.emEstoque.sub(movimento.quantidade),
        reservado: saldo.reservado.sub(movimento.quantidade),
        custoMedio: saldo.custoMedio,
        custoMedioNoMomento: saldo.custoMedio,
      });
  }
}

/** Pelo disponível: zerado sem nada disponível; abaixo do mínimo quando disponível < mínimo. */
export function situacaoDoSaldo(disponivel: Prisma.Decimal, estoqueMinimo: Prisma.Decimal): SituacaoDoSaldo {
  if (disponivel.lte(0)) return "zerado";
  if (disponivel.lt(estoqueMinimo)) return "abaixo_do_minimo";
  return "normal";
}

export function saldoParaContrato(item: { emEstoque: Prisma.Decimal; reservado: Prisma.Decimal; custoMedio: Prisma.Decimal | null; estoqueMinimo: Prisma.Decimal }) {
  const disponivel = item.emEstoque.sub(item.reservado);
  const falta = item.estoqueMinimo.sub(disponivel);
  return {
    emEstoque: item.emEstoque.toFixed(3),
    reservado: item.reservado.toFixed(3),
    disponivel: disponivel.toFixed(3),
    custoMedio: item.custoMedio === null ? null : item.custoMedio.toFixed(2),
    valor: item.custoMedio === null ? "0.00" : item.emEstoque.mul(item.custoMedio).toFixed(2),
    situacao: situacaoDoSaldo(disponivel, item.estoqueMinimo),
    faltaParaOMinimo: falta.gt(0) ? falta.toFixed(3) : "0.000",
  };
}

/** Próximo código gerado da empresa: EST-0001, EST-0002… pelo maior já usado. */
export function proximoCodigo(codigosExistentes: readonly string[]): string {
  const maior = codigosExistentes.reduce((max, codigo) => {
    const achado = /^EST-(\d+)$/.exec(codigo);
    return achado ? Math.max(max, Number(achado[1])) : max;
  }, 0);
  return `EST-${String(maior + 1).padStart(4, "0")}`;
}

/** Segunda-feira (em Manaus) da semana de um dia AAAA-MM-DD. */
export function segundaDaSemana(dia: string): string {
  const [ano, mes, d] = dia.split("-").map(Number) as [number, number, number];
  const data = new Date(Date.UTC(ano, mes - 1, d));
  const deslocamento = (data.getUTCDay() + 6) % 7;
  data.setUTCDate(data.getUTCDate() - deslocamento);
  return data.toISOString().slice(0, 10);
}

/** As 8 semanas até a atual, com entradas e saídas somadas (a baixa conta como saída). */
export function ultimas8Semanas(movimentos: readonly { tipo: string; data: string; quantidade: Prisma.Decimal }[], agora: Date) {
  const atual = segundaDaSemana(diaEmManaus(agora));
  const inicios = Array.from({ length: 8 }, (_, i) => {
    const data = new Date(`${atual}T12:00:00Z`);
    data.setUTCDate(data.getUTCDate() - 7 * (7 - i));
    return data.toISOString().slice(0, 10);
  });
  const somas = new Map(inicios.map((inicio) => [inicio, { entradas: ZERO, saidas: ZERO }]));
  for (const movimento of movimentos) {
    const semana = somas.get(segundaDaSemana(movimento.data));
    if (!semana) continue;
    if (movimento.tipo === "entrada") semana.entradas = semana.entradas.add(movimento.quantidade);
    if (movimento.tipo === "saida") semana.saidas = semana.saidas.add(movimento.quantidade);
  }
  return inicios.map((inicio) => ({ inicio, entradas: somas.get(inicio)!.entradas.toFixed(3), saidas: somas.get(inicio)!.saidas.toFixed(3) }));
}

export type VinculoParaTexto = {
  tipo: string;
  origem: string | null;
  destino: string | null;
  obra: { nome: string } | null;
  cliente: { nome: string } | null;
  area: string | null;
  pedido: { numero: number } | null;
};

const numeroDoPedido = (numero: number) => `PC-${String(numero).padStart(4, "0")}`;

/** O texto pronto de origem ou destino que a tela mostra. */
export function origemOuDestino(m: VinculoParaTexto): string {
  const pedido = m.pedido ? numeroDoPedido(m.pedido.numero) : null;
  if (m.tipo === "ajuste") return "Ajuste";
  if (m.tipo === "reserva" || m.tipo === "liberacao") return pedido ? `${m.tipo === "reserva" ? "Reserva" : "Liberação"} · ${pedido}` : "Reserva";
  if (m.tipo === "entrada") {
    const rotulo = { compra: "Compra", devolucao: "Devolução", saldo_inicial: "Saldo inicial", outra: "Outra entrada" }[m.origem ?? "outra"] ?? "Entrada";
    return pedido ? `${rotulo} · ${pedido}` : rotulo;
  }
  const destino =
    m.destino === "obra" ? `Obra ${m.obra?.nome ?? ""}`.trim()
    : m.destino === "cliente" ? `Cliente ${m.cliente?.nome ?? ""}`.trim()
    : m.area ? `Interno · ${m.area}` : "Interno";
  return pedido ? `${destino} · ${pedido}` : destino;
}

/** O dia informado não pode ser futuro (em Manaus). */
export function diaValido(dia: string, agora: Date): boolean {
  return dia <= diaEmManaus(agora);
}
