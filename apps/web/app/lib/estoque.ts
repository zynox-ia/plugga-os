import {
  categoriasDeItemDeEstoque,
  companyKeys,
  tiposDeMovimentacao,
  type CategoriaDeItemDeEstoque,
  type CompanyKey,
  type ItemDeEstoqueNaLista,
  type Movimentacao,
  type PedidoDeCompra,
  type SituacaoDoSaldo,
  type TipoDeMovimentacao,
} from "@plugga/shared";

import { lerIntervalo, type IntervaloLivre } from "./periodo-livre.ts";

/**
 * Estoque (PLU-333): filtros pelo endereço, números e regras de tela do saldo,
 * das movimentações e do registro. Uma tela só para Plugga e Waze; a empresa é
 * filtro e campo do item. O saldo vem da API (PLU-332); aqui só se mostra e se
 * prevê o efeito de uma movimentação antes de registrá-la.
 */

export const ROTA_ESTOQUE = "/suprimentos/estoque";

export const visoesDoEstoque = ["cards", "lista", "movimentacoes"] as const;
export type VisaoDoEstoque = (typeof visoesDoEstoque)[number];

/** O filtro "Saldo" da tela; a API também aceita "normal", que a tela não oferece. */
export const filtrosDeSaldoDaTela = ["abaixo_do_minimo", "zerado", "com_reserva"] as const;
export type FiltroDeSaldoDaTela = (typeof filtrosDeSaldoDaTela)[number];
export const ROTULO_DO_FILTRO_DE_SALDO: Record<FiltroDeSaldoDaTela, string> = {
  abaixo_do_minimo: "Abaixo do mínimo",
  zerado: "Zerados",
  com_reserva: "Com reserva",
};

/** A API devolve os últimos 30 dias quando não há período; a tela deixa isso explícito. */
export const periodosDeMovimentacao = ["7", "30", "mes"] as const;
export type PeriodoDeMovimentacao = (typeof periodosDeMovimentacao)[number];
export const ROTULO_DO_PERIODO_DE_MOVIMENTACAO: Record<PeriodoDeMovimentacao, string> = {
  "7": "Últimos 7 dias",
  "30": "Últimos 30 dias",
  mes: "Este mês",
};

export const ROTULO_DO_FILTRO_DE_TIPO: Record<TipoDeMovimentacao, string> = {
  entrada: "Entradas",
  saida: "Saídas",
  ajuste: "Ajustes",
  reserva: "Reservas",
  liberacao: "Liberações de reserva",
};

export type FiltrosDeEstoque = {
  visao: VisaoDoEstoque;
  busca?: string;
  empresa?: CompanyKey;
  /** Cards e lista. */
  categoria?: CategoriaDeItemDeEstoque;
  saldo?: FiltroDeSaldoDaTela;
  /** Movimentações. */
  tipo?: TipoDeMovimentacao;
  itemId?: string;
  periodo: PeriodoDeMovimentacao;
  /** Movimentações: período personalizado (?de=&ate=). Exclui o atalho: a API não aceita os dois. */
  intervalo?: IntervaloLivre;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (valor: string | undefined): valor is string => Boolean(valor && UUID.test(valor));

/** Lê os filtros do endereço; valor desconhecido cai no padrão em vez de virar erro da API. */
export function lerFiltrosDeEstoque(p: Record<string, string | undefined>): FiltrosDeEstoque {
  const empresa = companyKeys.find((e) => e === p.empresa);
  const categoria = categoriasDeItemDeEstoque.find((c) => c === p.categoria);
  const saldo = filtrosDeSaldoDaTela.find((s) => s === p.saldo);
  const tipo = tiposDeMovimentacao.find((t) => t === p.tipo);
  const visao = visoesDoEstoque.find((v) => v === p.visao) ?? "cards";
  const intervalo = visao === "movimentacoes" ? lerIntervalo(p.de, p.ate) : null;
  return {
    visao,
    busca: p.busca?.trim().slice(0, 150) || undefined,
    ...(empresa ? { empresa } : {}),
    ...(categoria ? { categoria } : {}),
    ...(saldo ? { saldo } : {}),
    ...(tipo ? { tipo } : {}),
    ...(ehUuid(p.item_mov) ? { itemId: p.item_mov } : {}),
    ...(intervalo ? { intervalo } : {}),
    periodo: intervalo ? "30" : periodosDeMovimentacao.find((x) => x === p.periodo) ?? "30",
  };
}

/** Os filtros, a visão e a ficha do item vão no endereço: o mesmo link abre a mesma tela. */
export function hrefDeEstoque(f: Partial<FiltrosDeEstoque>, item?: string | null): string {
  const q = new URLSearchParams();
  if (f.visao && f.visao !== "cards") q.set("visao", f.visao);
  if (f.busca) q.set("busca", f.busca);
  if (f.empresa) q.set("empresa", f.empresa);
  if (f.visao !== "movimentacoes") {
    if (f.categoria) q.set("categoria", f.categoria);
    if (f.saldo) q.set("saldo", f.saldo);
  } else {
    if (f.tipo) q.set("tipo", f.tipo);
    if (f.itemId) q.set("item_mov", f.itemId);
    if (f.intervalo) { q.set("de", f.intervalo.de); q.set("ate", f.intervalo.ate); }
    else if (f.periodo && f.periodo !== "30") q.set("periodo", f.periodo);
  }
  if (item) q.set("item", item);
  const texto = q.toString();
  return texto ? `${ROTA_ESTOQUE}?${texto}` : ROTA_ESTOQUE;
}

/** Há filtro além do padrão na visão atual (para mostrar "Limpar"). */
export function temFiltro(f: FiltrosDeEstoque): boolean {
  if (f.busca || f.empresa) return true;
  return f.visao === "movimentacoes" ? Boolean(f.tipo || f.itemId || f.intervalo || f.periodo !== "30") : Boolean(f.categoria || f.saldo);
}

export const consultaDeItens = (f: FiltrosDeEstoque): Record<string, string | undefined> => ({
  empresa: f.empresa,
  categoria: f.categoria,
  saldo: f.saldo,
  busca: f.busca,
});

export const consultaDeMovimentacoes = (f: FiltrosDeEstoque): Record<string, string | undefined> => ({
  empresa: f.empresa,
  tipo: f.tipo,
  itemId: f.itemId,
  busca: f.busca,
  ...(f.intervalo ? { periodo: undefined, de: f.intervalo.de, ate: f.intervalo.ate } : { periodo: f.periodo }),
});

// ---------------------------------------------------------------- números

const NUMERO = (casas: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas });
const QTD = NUMERO(3);

/** "36.000" + "un" → "36 un"; "1234.5" + "m" → "1.234,5 m". */
export function qtd(valor: string | number, unidade: string): string {
  const n = typeof valor === "number" ? valor : Number(valor);
  return `${QTD.format(Number.isFinite(n) ? n : 0)} ${unidade}`;
}

/** Zero vira travessão, como no protótipo ("Reservado —"). */
export const qtdOuTraco = (valor: string, unidade: string): string => (Number(valor) === 0 ? "—" : qtd(valor, unidade));

/** Efeito no saldo em estoque: entrada soma, saída tira, ajuste vem com sinal; reserva e liberação não mexem no saldo. */
export function deltaDaMovimentacao(m: Pick<Movimentacao, "tipo" | "quantidade">): number {
  const q = Number(m.quantidade);
  if (m.tipo === "entrada") return q;
  if (m.tipo === "saida") return -Math.abs(q);
  if (m.tipo === "ajuste") return q;
  return 0;
}

/** "+40 par", "−120 m", "80 un" (reserva, sem sinal). Usa o sinal de menos tipográfico. */
export function qtdComSinal(m: Pick<Movimentacao, "tipo" | "quantidade" | "item">): string {
  if (m.tipo === "reserva" || m.tipo === "liberacao") return qtd(Math.abs(Number(m.quantidade)), m.item.unidade);
  const v = deltaDaMovimentacao(m);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${qtd(Math.abs(v), m.item.unidade)}`;
}

/** Tom do disponível no menu de itens: verde com saldo, âmbar abaixo do mínimo, vermelho suave sem nada. */
export type TomDoDisponivel = "ok" | "baixo" | "zero";
export function tomDoDisponivel(saldo: Pick<ItemDeEstoqueNaLista["saldo"], "disponivel" | "situacao">): TomDoDisponivel {
  if (Number(saldo.disponivel) <= 0) return "zero";
  return saldo.situacao === "abaixo_do_minimo" ? "baixo" : "ok";
}

/** Selo de situação: tom e texto. */
export const TOM_DA_SITUACAO: Record<SituacaoDoSaldo, "success" | "warning" | "danger"> = { normal: "success", abaixo_do_minimo: "warning", zerado: "danger" };

/**
 * Barra de nível: o saldo em relação a uma referência (o dobro do mínimo, ou o
 * próprio saldo quando maior), com o reservado hachurado no fim do saldo e o
 * traço do mínimo. Tudo em % da largura.
 */
export function nivelDoItem(emEstoque: number, reservado: number, minimo: number): { saldo: number; reservaInicio: number; reserva: number; minimo: number | null } {
  const ref = Math.max(minimo * 2, emEstoque, 1);
  const pct = (v: number) => Math.max(0, Math.min(100, (v / ref) * 100));
  const disponivel = Math.max(0, emEstoque - reservado);
  return { saldo: pct(emEstoque), reservaInicio: pct(disponivel), reserva: reservado > 0 ? pct(Math.min(reservado, emEstoque)) : 0, minimo: minimo > 0 ? pct(minimo) : null };
}

/** Situação calculada do jeito da API: pelo disponível. */
export function situacaoPeloDisponivel(disponivel: number, minimo: number): SituacaoDoSaldo {
  if (disponivel <= 0) return "zerado";
  return disponivel < minimo ? "abaixo_do_minimo" : "normal";
}

export type TipoRegistravel = "entrada" | "saida" | "ajuste";

export type Previa = {
  hoje: number;
  depois: number;
  disponivelDepois: number;
  situacao: SituacaoDoSaldo;
  /** Saída maior que o disponível: a API recusa. */
  excedeDisponivel: boolean;
  /** Ajuste que deixaria o estoque abaixo do reservado: a API recusa. */
  abaixoDoReservado: boolean;
};

/** "Hoje → Depois" do modal de registrar movimentação. Quantidade inválida conta como zero. */
export function previaDaMovimentacao(tipo: TipoRegistravel, saldo: Pick<ItemDeEstoqueNaLista["saldo"], "emEstoque" | "reservado" | "disponivel">, minimo: number, quantidade: number | null, saldoContado: number | null): Previa {
  const hoje = Number(saldo.emEstoque);
  const reservado = Number(saldo.reservado);
  const q = quantidade && quantidade > 0 ? quantidade : 0;
  const depois = tipo === "entrada" ? hoje + q : tipo === "saida" ? hoje - q : saldoContado ?? hoje;
  const disponivelDepois = Math.max(0, depois - reservado);
  return {
    hoje,
    depois: Math.max(0, depois),
    disponivelDepois,
    situacao: situacaoPeloDisponivel(disponivelDepois, minimo),
    excedeDisponivel: tipo === "saida" && q > Number(saldo.disponivel),
    abaixoDoReservado: tipo === "ajuste" && saldoContado !== null && saldoContado < reservado,
  };
}

/**
 * Texto digitado como número pt-BR: "1.234,56" → 1234.56; "12.5" (sem vírgula)
 * → 12.5. Vazio ou inválido → null. Até `casas` casas decimais.
 */
export function numeroDigitado(texto: string, casas = 3): number | null {
  const bruto = texto.trim().replace(/\s|R\$/g, "");
  if (!bruto) return null;
  const limpo = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(bruto) && casas < 3 ? bruto.replace(/\./g, "") : bruto;
  if (!new RegExp(`^\\d+(\\.\\d{1,${casas}})?$`).test(limpo)) return null;
  return Number(limpo);
}

/** Número para o contrato (decimal em texto, sem notação científica). */
export const paraContrato = (n: number, casas: number): string => String(Number(n.toFixed(casas)));

// ---------------------------------------------------------------- datas

const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const diaUtc = (dia: string) => { const [a, m, d] = dia.slice(0, 10).split("-").map(Number) as [number, number, number]; return Date.UTC(a, m - 1, d); };

/** Faixa do dia na lista de movimentações: "Hoje", "Ontem" ou "21 de novembro · sábado". */
export function rotuloDoDia(dia: string, hoje: string): string {
  const diferenca = Math.round((diaUtc(hoje) - diaUtc(dia)) / 864e5);
  if (diferenca === 0) return "Hoje";
  if (diferenca === 1) return "Ontem";
  const d = new Date(diaUtc(dia));
  return `${d.getUTCDate()} de ${MESES_LONGOS[d.getUTCMonth()]} · ${DIAS_DA_SEMANA[d.getUTCDay()]}`;
}

/** "23 de novembro de 2026". */
export function diaPorExtenso(dia: string): string {
  const d = new Date(diaUtc(dia));
  return `${d.getUTCDate()} de ${MESES_LONGOS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** Hora de Manaus (UTC−4) de um ISO: "13:35". */
export function horaEmManaus(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 4 * 60 * 60 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** Primeiro nome, para a coluna "Quem". */
export const primeiroNome = (nome: string | undefined | null): string => nome?.trim().split(/\s+/)[0] ?? "—";

export const UNIDADES_DE_ESTOQUE = ["un", "m", "par", "kit", "cx", "kg", "rolo", "lote", "l"] as const;

// ---------------------------------------------------------------- recebimento de compra

export type EntradaDoItem = { marcado: boolean; quantidade: string; custo: string };
export type EstadoDaEntrada = Record<string, EntradaDoItem>;

/** Itens do pedido vinculados ao estoque: os que podem dar entrada no recebimento. */
export const itensComVinculo = (pedido: Pick<PedidoDeCompra, "itens">) => pedido.itens.filter((i) => i.itemDeEstoque);

/** Começa com todos os vinculados marcados e a quantidade do pedido. */
export function entradaInicial(pedido: Pick<PedidoDeCompra, "itens">): EstadoDaEntrada {
  return Object.fromEntries(itensComVinculo(pedido).map((i) => [i.id, { marcado: true, quantidade: Number(i.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 }), custo: "" }]));
}

/** O `entradaNoEstoque` da ação confirmar_recebimento, ou os erros por item. Sem item marcado: nada a enviar. */
export function entradaDoRecebimento(estado: EstadoDaEntrada): { entrada?: { itemDoPedidoId: string; quantidade: string; custoUnitario: string }[]; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const entrada = Object.entries(estado).filter(([, e]) => e.marcado).map(([id, e]) => {
    const q = numeroDigitado(e.quantidade);
    const c = numeroDigitado(e.custo, 2);
    if (q === null || q <= 0) erros[`${id}-quantidade`] = "quantidade maior que zero.";
    if (c === null || c <= 0) erros[`${id}-custo`] = "informe o custo, como 9,50.";
    return { itemDoPedidoId: id, quantidade: q ? paraContrato(q, 3) : "", custoUnitario: c ? c.toFixed(2) : "" };
  });
  return Object.keys(erros).length ? { erros } : { entrada: entrada.length ? entrada : undefined, erros };
}
