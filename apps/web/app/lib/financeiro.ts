import {
  companyKeys,
  filtrosDeVencimento,
  situacoesDoFiltroFinanceiro,
  type LancamentoResumo,
  type ListarLancamentosResposta,
  type SituacaoDoFiltroFinanceiro,
} from "@plugga/shared";

import { diaCurto } from "./compras.ts";

/**
 * Financeiro (PLU-336): a tela de Lançamentos, com as saídas (contas a pagar) e
 * as entradas (cobranças) da Plugga e da Waze. Filtros, visão e ficha vão no
 * endereço, como em Compras e no Estoque: o mesmo link abre a mesma tela.
 */

export const ROTA_LANCAMENTOS = "/financeiro/lancamentos";

export const visoesDosLancamentos = ["cards", "lista", "quadro"] as const;
export type VisaoDosLancamentos = (typeof visoesDosLancamentos)[number];

export type VencimentoDoFiltro = (typeof filtrosDeVencimento)[number];

export type FiltrosDosLancamentos = {
  visao: VisaoDosLancamentos;
  situacao?: SituacaoDoFiltroFinanceiro;
  empresa?: (typeof companyKeys)[number];
  vencimento?: VencimentoDoFiltro;
  busca?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuidDoLancamento = (valor: string | undefined): valor is string => Boolean(valor && UUID.test(valor));

/** Lê os filtros do endereço; valor desconhecido cai no padrão em vez de virar erro da API. */
export function lerFiltrosDosLancamentos(p: Record<string, string | undefined>): FiltrosDosLancamentos {
  const situacao = situacoesDoFiltroFinanceiro.find((s) => s === p.situacao);
  const empresa = companyKeys.find((e) => e === p.empresa);
  const vencimento = filtrosDeVencimento.find((v) => v === p.vencimento);
  const busca = p.busca?.trim().slice(0, 120) || undefined;
  const visao = visoesDosLancamentos.find((v) => v === p.visao) ?? "cards";
  return {
    visao,
    // O Quadro não tem situação: um link antigo com as duas não guarda um filtro escondido.
    ...(situacao && visao !== "quadro" ? { situacao } : {}),
    ...(empresa ? { empresa } : {}),
    // O cancelado não vence: a API recusa Canceladas com Vencimento (400).
    ...(vencimento && situacao !== "cancelado" ? { vencimento } : {}),
    ...(busca ? { busca } : {}),
  };
}

/** O endereço da tela: Cards é o padrão e não aparece na URL. */
export function hrefDosLancamentos(f: Partial<FiltrosDosLancamentos>, lancamento?: string | null): string {
  const q = new URLSearchParams();
  if (f.visao && f.visao !== "cards") q.set("visao", f.visao);
  if (f.situacao) q.set("situacao", f.situacao);
  if (f.empresa) q.set("empresa", f.empresa);
  if (f.vencimento) q.set("vencimento", f.vencimento);
  if (f.busca) q.set("busca", f.busca);
  if (lancamento) q.set("lancamento", lancamento);
  const texto = q.toString();
  return texto ? `${ROTA_LANCAMENTOS}?${texto}` : ROTA_LANCAMENTOS;
}

/**
 * Escolher uma situação ou um vencimento: Canceladas e Vencimento não andam
 * juntos (o cancelado não vence), então a escolha nova desliga a outra.
 */
export function comSituacao(f: FiltrosDosLancamentos, situacao: FiltrosDosLancamentos["situacao"]): FiltrosDosLancamentos {
  const novo: FiltrosDosLancamentos = { ...f, situacao };
  if (!situacao) delete novo.situacao;
  if (situacao === "cancelado") delete novo.vencimento;
  return novo;
}

export function comVencimento(f: FiltrosDosLancamentos, vencimento: FiltrosDosLancamentos["vencimento"]): FiltrosDosLancamentos {
  const novo: FiltrosDosLancamentos = { ...f, vencimento };
  if (!vencimento) delete novo.vencimento;
  if (vencimento && f.situacao === "cancelado") delete novo.situacao;
  return novo;
}

/**
 * Trocar de visão. O Quadro não tem situação (as colunas já são a situação):
 * ir para ele desliga o filtro, para ele não voltar escondido na Lista.
 */
export function comVisao(f: FiltrosDosLancamentos, visao: VisaoDosLancamentos): FiltrosDosLancamentos {
  const novo: FiltrosDosLancamentos = { ...f, visao };
  if (visao === "quadro") delete novo.situacao;
  return novo;
}

/** Os metric cards ligam a situação; no Quadro, que não a tem, eles não são clicáveis. */
export const cardsClicaveis = (f: Pick<FiltrosDosLancamentos, "visao">): boolean => f.visao !== "quadro";

const centavos = (valor: string): number => {
  const [inteiro = "0", fracao = ""] = valor.split(".");
  const sinal = inteiro.startsWith("-") ? -1 : 1;
  return sinal * (Math.abs(Number(inteiro)) * 100 + Number(fracao.padEnd(2, "0").slice(0, 2)));
};

/** Soma dos valores do tipo em centavos inteiros (dinheiro não passa por float), de volta como "1234.56". */
export function somaDoTipo(itens: readonly Pick<LancamentoResumo, "tipo" | "valor">[], tipo: LancamentoResumo["tipo"]): string {
  const total = itens.filter((l) => l.tipo === tipo).reduce((s, l) => s + centavos(l.valor), 0);
  const absoluto = Math.abs(total);
  return `${total < 0 ? "-" : ""}${Math.floor(absoluto / 100)}.${String(absoluto % 100).padStart(2, "0")}`;
}

/** Há filtro além da visão? (mostra "Limpar" e muda o texto do vazio) */
export const temFiltroNosLancamentos = (f: FiltrosDosLancamentos): boolean => Boolean(f.situacao || f.empresa || f.vencimento || f.busca);

/** Quantos filtros estão ligados, para o botão "Filtros" do celular. */
export const quantosFiltros = (f: FiltrosDosLancamentos): number => [f.situacao, f.empresa, f.vencimento, f.busca].filter(Boolean).length;

/**
 * Consulta da API. O quadro não leva situação: as colunas já são a situação.
 * Só os filtros preenchidos vão (o schema da API é estrito).
 */
export function consultaDosLancamentos(f: FiltrosDosLancamentos, para: "lista" | "quadro"): Record<string, string> {
  const consulta: Record<string, string> = {};
  if (para === "lista" && f.situacao) consulta.situacao = f.situacao;
  if (f.empresa) consulta.empresa = f.empresa;
  if (f.vencimento) consulta.vencimento = f.vencimento;
  if (f.busca) consulta.busca = f.busca;
  return consulta;
}

// ---------------------------------------------------------------- filtro de Situação

export type IconeDaSituacao = "camadas" | "saida" | "relogio" | "check" | "alerta" | "entrada" | "arquivo" | "enviar" | "concluido" | "carteira" | "link" | "cancelado" | "nuvem";

export type OpcaoDeSituacao = {
  valor: SituacaoDoFiltroFinanceiro | "";
  rotulo: string;
  /** Texto do gatilho quando a opção está escolhida ("A pagar · Em aberto"). */
  curto: string;
  grupo?: "A pagar" | "A receber" | "Concluídas" | "Atenção";
  icone: IconeDaSituacao;
  /** Só faz sentido para quem alcança esse tipo. */
  tipo?: "saida" | "entrada";
};

/** Um menu só, com grupos, como no protótipo aprovado (PLU-336). */
export const OPCOES_DE_SITUACAO: readonly OpcaoDeSituacao[] = [
  { valor: "", rotulo: "Todas as situações", curto: "Situação", icone: "camadas" },
  { valor: "pagar", rotulo: "Tudo a pagar", curto: "A pagar", grupo: "A pagar", icone: "saida", tipo: "saida" },
  { valor: "pagar-aberto", rotulo: "Em aberto · para aprovar", curto: "A pagar · Em aberto", grupo: "A pagar", icone: "relogio", tipo: "saida" },
  { valor: "pagar-aprovado", rotulo: "Aprovadas · para pagar", curto: "A pagar · Aprovadas", grupo: "A pagar", icone: "check", tipo: "saida" },
  { valor: "pagar-vencido", rotulo: "Vencidas", curto: "A pagar · Vencidas", grupo: "A pagar", icone: "alerta", tipo: "saida" },
  { valor: "receber", rotulo: "Tudo a receber", curto: "A receber", grupo: "A receber", icone: "entrada", tipo: "entrada" },
  { valor: "receber-gerado", rotulo: "Geradas · antes do envio", curto: "A receber · Geradas", grupo: "A receber", icone: "arquivo", tipo: "entrada" },
  { valor: "receber-cobranca", rotulo: "Em cobrança · enviadas", curto: "A receber · Em cobrança", grupo: "A receber", icone: "enviar", tipo: "entrada" },
  { valor: "receber-vencido", rotulo: "Vencidas", curto: "A receber · Vencidas", grupo: "A receber", icone: "alerta", tipo: "entrada" },
  { valor: "concluido", rotulo: "Todas as concluídas", curto: "Concluídas", grupo: "Concluídas", icone: "concluido" },
  { valor: "pago", rotulo: "Pagas", curto: "Concluídas · Pagas", grupo: "Concluídas", icone: "carteira", tipo: "saida" },
  { valor: "recebido", rotulo: "Recebidas", curto: "Concluídas · Recebidas", grupo: "Concluídas", icone: "entrada", tipo: "entrada" },
  { valor: "conciliado", rotulo: "Conciliadas", curto: "Concluídas · Conciliadas", grupo: "Concluídas", icone: "link" },
  { valor: "cancelado", rotulo: "Canceladas", curto: "Concluídas · Canceladas", grupo: "Concluídas", icone: "cancelado" },
  { valor: "vencidos", rotulo: "Vencidos · a pagar e a receber", curto: "Vencidos", grupo: "Atenção", icone: "alerta" },
  { valor: "erro", rotulo: "Com erro no OMIE", curto: "Com erro no OMIE", grupo: "Atenção", icone: "nuvem" },
];

/** As opções que valem para o alcance da pessoa: quem só paga não vê o grupo A receber. */
/**
 * As situações que a pessoa alcança. "Com erro no OMIE" só aparece com o OMIE
 * conectado para alguma empresa: com o conector desligado, nada vai ao OMIE.
 */
export function opcoesDeSituacaoPara(alcance: ListarLancamentosResposta["alcance"], { omieConectado = true }: { omieConectado?: boolean } = {}): OpcaoDeSituacao[] {
  return OPCOES_DE_SITUACAO.filter((o) => (!o.tipo || (o.tipo === "saida" ? alcance.saidas : alcance.entradas)) && (omieConectado || o.valor !== "erro"));
}

export const OPCOES_DE_VENCIMENTO: readonly { valor: VencimentoDoFiltro | ""; rotulo: string }[] = [
  { valor: "", rotulo: "Qualquer vencimento" },
  { valor: "vencidos", rotulo: "Vencidos" },
  { valor: "hoje", rotulo: "Vencem hoje" },
  { valor: "7", rotulo: "Próximos 7 dias" },
  { valor: "mes", rotulo: "Até o fim do mês" },
];

// ---------------------------------------------------------------- card, lista e quadro

/**
 * O que a etapa pede agora, na voz da fila (o selo do card): a saída aberta está
 * "Para aprovar", a entrada gerada pede "Emitir a NF". `curto` é o texto do selo;
 * `completo`, o do title e da ficha.
 */
export function seloDaEtapa(l: Pick<LancamentoResumo, "tipo" | "etapa" | "emCobranca" | "cancelado">): { curto: string; completo: string } {
  if (l.cancelado) return { curto: "Cancelada", completo: "Cancelada" };
  if (l.emCobranca) return { curto: "Em cobrança", completo: "Em cobrança · vencida" };
  switch (l.etapa) {
    case "aberta": return { curto: "Para aprovar", completo: "Para aprovar" };
    case "aprovada": return { curto: "Para pagar", completo: "Para pagar" };
    case "paga": return { curto: "A conciliar", completo: "Paga · a conciliar" };
    case "gerada": return { curto: "Emitir a NF", completo: "Emitir a NF" };
    case "nf_emitida": return { curto: "Gerar o boleto", completo: "Gerar o boleto" };
    case "boleto_gerado": return { curto: "Enviar ao cliente", completo: "Enviar ao cliente" };
    case "enviada": return { curto: "Aguardando", completo: "Aguardando pagamento" };
    case "recebida": return { curto: "A conciliar", completo: "Recebida · a conciliar" };
    case "conciliada": return { curto: "Conciliada", completo: "Conciliada" };
  }
}

/** Pendência no OMIE: o card mostra só um ícone de alerta (o resto fica na ficha). */
export const temPendenciaNoOmie = (l: Pick<LancamentoResumo, "omie">): boolean => l.omie.estado === "erro" || l.omie.estado === "divergente";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export type PrazoDoCard = {
  /** "20 nov": o vencimento, ou o dia do pagamento ou recebimento. */
  data: string;
  /** "vencido há 3 dias", "vence hoje", "paga". */
  relativo: string;
  /** Só quando sinaliza algo, e nunca junto com uma pendência do OMIE (uma cor por card). */
  tom: "perigo" | "alerta" | null;
};

/** Rodapé do card e coluna Vencimento da lista. */
export function prazoDoLancamento(l: Pick<LancamentoResumo, "tipo" | "prazo" | "liquidadoEm" | "vencimento" | "cancelado" | "etapa" | "omie">): PrazoDoCard {
  if (l.cancelado) return { data: diaCurto(l.vencimento), relativo: "cancelada", tom: null };
  if (l.liquidadoEm) {
    const relativo = l.etapa === "conciliada" ? "conciliada" : l.tipo === "saida" ? "paga" : "recebida";
    return { data: diaCurto(l.liquidadoEm), relativo, tom: null };
  }
  const data = diaCurto(l.vencimento);
  if (!l.prazo) return { data, relativo: "", tom: null };
  const pendencia = temPendenciaNoOmie(l);
  const { dias } = l.prazo;
  if (l.prazo.situacao === "vencido") return { data, relativo: `vencido há ${plural(-dias, "dia", "dias")}`, tom: pendencia ? null : "perigo" };
  if (l.prazo.situacao === "vence_hoje") return { data, relativo: "vence hoje", tom: pendencia ? null : "alerta" };
  return { data, relativo: dias === 1 ? "vence amanhã" : `vence em ${plural(dias, "dia", "dias")}`, tom: null };
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-10" → "out/2026". */
export function competenciaLegivel(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number) as [number, number];
  return `${MESES[mes - 1]}/${ano}`;
}

/** A linha abaixo do favorecido: a descrição da saída, ou a competência da entrada. */
export function resumoDoLancamento(l: Pick<LancamentoResumo, "tipo" | "descricao" | "competencia">): string {
  if (l.tipo === "saida" || !l.competencia) return l.descricao;
  const competencia = `Competência ${competenciaLegivel(l.competencia)}`;
  return l.descricao ? `${competencia} · ${l.descricao}` : competencia;
}

/** "a pagar", "pago", "a receber", "recebido": ao lado do valor. */
export function rotuloDoValor(l: Pick<LancamentoResumo, "tipo" | "liquidadoEm">): string {
  if (l.tipo === "saida") return l.liquidadoEm ? "pago" : "a pagar";
  return l.liquidadoEm ? "recebido" : "a receber";
}

// ---------------------------------------------------------------- metric cards

/** Clicar num metric card liga o filtro dele; clicar de novo desliga. */
export const FILTRO_DO_CARD = {
  aReceber: { situacao: "receber", vencimento: "mes" },
  aPagar: { situacao: "pagar", vencimento: "mes" },
  vencidos: { situacao: "vencidos" },
} as const satisfies Record<string, Pick<FiltrosDosLancamentos, "situacao" | "vencimento">>;

export type CardDoResumo = keyof typeof FILTRO_DO_CARD;

export function cardAtivo(f: FiltrosDosLancamentos, card: CardDoResumo): boolean {
  const alvo: Pick<FiltrosDosLancamentos, "situacao" | "vencimento"> = FILTRO_DO_CARD[card];
  return f.situacao === alvo.situacao && f.vencimento === alvo.vencimento;
}

/** O filtro depois do clique no card: liga o dele ou, se já estava ligado, volta para sem situação e vencimento. */
export function filtroAoClicarNoCard(f: FiltrosDosLancamentos, card: CardDoResumo): FiltrosDosLancamentos {
  const resto: FiltrosDosLancamentos = { ...f };
  delete resto.situacao;
  delete resto.vencimento;
  return cardAtivo(f, card) ? resto : { ...resto, ...FILTRO_DO_CARD[card] };
}
