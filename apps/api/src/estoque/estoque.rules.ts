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

/** O que a entrada por compra precisa saber do pedido, para um item de estoque. */
export type PedidoDaEntrada = {
  numero: number;
  cancelado: boolean;
  atendidoPeloEstoque: boolean;
  /** Soma das linhas do pedido vinculadas ao item. */
  pedida: Prisma.Decimal;
  /** Entradas de origem compra já ligadas ao pedido, deste item. */
  recebida: Prisma.Decimal;
};

/** O que ainda falta entrar do item por este pedido (nunca negativo). */
export function faltaEntrar(pedido: Pick<PedidoDaEntrada, "pedida" | "recebida">): Prisma.Decimal {
  const falta = pedido.pedida.sub(pedido.recebida);
  return falta.gt(0) ? falta : ZERO;
}

/**
 * A entrada por compra ligada a um pedido: o pedido tem o item vinculado, não
 * está cancelado nem foi atendido pelo estoque (aí o material sai da reserva,
 * não entra por compra), e a soma das entradas não passa do que ele pediu do
 * item. `pedido` nulo: o pedido não tem linha vinculada ao item.
 */
export function problemaDaEntradaDoPedido(
  pedido: PedidoDaEntrada | null,
  quantidade: Prisma.Decimal,
  unidade: string,
  numeroSemVinculo: number | null,
): { mensagem: string; campo: "pedidoId" | "quantidade"; estado: boolean } | null {
  const numero = numeroDoPedido(pedido?.numero ?? numeroSemVinculo ?? 0);
  if (!pedido || pedido.pedida.lte(0)) return { mensagem: `O pedido ${numero} não tem este item vinculado ao estoque.`, campo: "pedidoId", estado: false };
  if (pedido.cancelado) return { mensagem: `O pedido ${numero} está cancelado: não recebe entrada.`, campo: "pedidoId", estado: true };
  if (pedido.atendidoPeloEstoque) return { mensagem: `O pedido ${numero} foi atendido pelo estoque: o material sai da reserva, não entra por compra.`, campo: "pedidoId", estado: true };
  if (pedido.recebida.add(quantidade).gt(pedido.pedida)) {
    return {
      mensagem: `Este pedido (${numero}) já deu entrada de ${pedido.recebida.toFixed(3)} ${unidade} deste item, de ${pedido.pedida.toFixed(3)} ${unidade} pedidos.`,
      campo: "quantidade",
      estado: true,
    };
  }
  return null;
}

/** Pedido que aparece na escolha da entrada por compra: aceita entrada e ainda falta receber. */
export function aceitaEntradaDoPedido(pedido: PedidoDaEntrada): boolean {
  return !pedido.cancelado && !pedido.atendidoPeloEstoque && faltaEntrar(pedido).gt(0);
}

/** Por que uma linha do pedido não é atendida inteira pelo estoque. */
export type MotivoSemCobertura = "sem_vinculo" | "inativo" | "outra_empresa" | "insuficiente";

/**
 * A única regra de "este item pode atender este pedido?", usada pela análise
 * (cobertura) e pela gravação (reserva, entrada do recebimento), esta sob a
 * trava do item: o item tem de ser da empresa exigida e, quando o movimento
 * cria compromisso, estar ativo. A outra empresa vem antes: nada do item
 * alheio deve aparecer.
 */
export function itemIndisponivelParaOPedido(
  item: { companyId: string; ativo: boolean },
  exigencia: { empresa?: string; exigirAtivo: boolean },
): "outra_empresa" | "inativo" | null {
  if (exigencia.empresa && item.companyId !== exigencia.empresa) return "outra_empresa";
  if (exigencia.exigirAtivo && !item.ativo) return "inativo";
  return null;
}

export type LinhaParaCobertura = {
  quantidade: Prisma.Decimal;
  item: { id: string; companyId: string; ativo: boolean; emEstoque: Prisma.Decimal; reservado: Prisma.Decimal } | null;
};

/**
 * Quanto o estoque atende cada linha do pedido na análise (PLU-332), com as
 * mesmas condições da reserva: o item precisa estar ativo e ser da empresa do
 * pedido, e linhas do mesmo item dividem um disponível só, na ordem do pedido.
 * Assim a análise nunca promete o que a reserva recusa.
 */
export function coberturaPeloEstoque(linhas: readonly LinhaParaCobertura[], empresaDoPedido: string) {
  const restante = new Map<string, Prisma.Decimal>();
  const demanda = new Map<string, Prisma.Decimal>();
  for (const linha of linhas) {
    if (linha.item && linha.item.companyId === empresaDoPedido) demanda.set(linha.item.id, (demanda.get(linha.item.id) ?? ZERO).add(linha.quantidade));
  }
  const resultado = linhas.map((linha) => {
    const item = linha.item;
    if (!item) return { atende: ZERO, disponivel: null, pedidoDoItem: null, motivo: "sem_vinculo" as MotivoSemCobertura };
    const bloqueio = itemIndisponivelParaOPedido(item, { empresa: empresaDoPedido, exigirAtivo: true });
    // Item de outra empresa: nada dele (saldo, código, nome) sai na análise deste pedido, só o motivo.
    if (bloqueio === "outra_empresa") return { atende: ZERO, disponivel: null, pedidoDoItem: null, motivo: bloqueio };
    const disponivel = Prisma.Decimal.max(item.emEstoque.sub(item.reservado), 0);
    const pedidoDoItem = demanda.get(item.id)!;
    if (bloqueio) return { atende: ZERO, disponivel, pedidoDoItem, motivo: bloqueio };
    const sobra = restante.get(item.id) ?? disponivel;
    const atende = Prisma.Decimal.min(linha.quantidade, sobra);
    restante.set(item.id, sobra.sub(atende));
    return { atende, disponivel, pedidoDoItem, motivo: atende.gte(linha.quantidade) ? null : ("insuficiente" as MotivoSemCobertura) };
  });
  return { linhas: resultado, atendeTudo: resultado.length > 0 && resultado.every((r) => r.motivo === null) };
}

/** O dia informado não pode ser futuro (em Manaus). */
export function diaValido(dia: string, agora: Date): boolean {
  return dia <= diaEmManaus(agora);
}
