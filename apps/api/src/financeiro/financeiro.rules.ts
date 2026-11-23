import {
  acoesDoLancamento,
  alcancaDepartamento,
  alcancaTela,
  colunaDaEtapa,
  etapasLiquidadas,
  type Acesso,
  type AcaoDoLancamento,
  type ColunaDoQuadroFinanceiro,
  type EtapaDeLancamento,
  type NomeDaAcaoDoLancamento,
  type OrigemDoLancamento,
  type SituacaoDoFiltroFinanceiro,
  type TipoDeLancamento,
} from "@plugga/shared";

import { diaEmManaus, inicioDoDiaEmManaus } from "../compras/dias-uteis";

/**
 * Regras puras do Financeiro (PLU-336): quem alcança o quê, as transições de
 * etapa, o prazo e a tradução do filtro de Situação. Sem banco nem relógio
 * implícito: `agora` entra como parâmetro.
 */

// ---------------------------------------------------------------- acesso

export type PapelNoFinanceiro = {
  /** Vê e opera as saídas (`financeiro.pagar`). */
  saidas: boolean;
  /** Vê e opera as entradas (`financeiro.receber`). */
  entradas: boolean;
  /** Gerente do Financeiro, Admin ou Desenvolvedor: aprova. */
  gerente: boolean;
};

export function papelNoFinanceiro(acesso: Acesso | undefined): PapelNoFinanceiro {
  if (!acesso) return { saidas: false, entradas: false, gerente: false };
  return {
    saidas: alcancaTela(acesso, "financeiro.pagar"),
    entradas: alcancaTela(acesso, "financeiro.receber"),
    gerente: acesso.plataforma !== null || alcancaDepartamento(acesso, "financeiro", "gerente"),
  };
}

export const alcancaTipo = (papel: PapelNoFinanceiro, tipo: TipoDeLancamento): boolean =>
  tipo === "saida" ? papel.saidas : papel.entradas;

/** Os tipos que a pessoa vê nos Lançamentos, já cruzados com o filtro Tipo. */
export function tiposVisiveis(papel: PapelNoFinanceiro, filtro: "todos" | TipoDeLancamento): TipoDeLancamento[] {
  const pedidos: TipoDeLancamento[] = filtro === "todos" ? ["saida", "entrada"] : [filtro];
  return pedidos.filter((tipo) => alcancaTipo(papel, tipo));
}

// ---------------------------------------------------------------- estado

export type EstadoDoLancamento = {
  tipo: TipoDeLancamento;
  etapa: EtapaDeLancamento;
  canceladoEm: Date | null;
  vencimento: Date;
};

export const estaLiquidado = (etapa: EtapaDeLancamento): boolean => etapasLiquidadas.includes(etapa);

/** Em andamento: nem liquidado nem cancelado. É o que vence e o que se cancela. */
export const emAberto = (l: Pick<EstadoDoLancamento, "etapa" | "canceladoEm">): boolean =>
  l.canceladoEm === null && !estaLiquidado(l.etapa);

/** Dias de calendário de Manaus de `agora` até o vencimento (negativo = vencido). */
export function diasParaVencer(vencimento: Date, agora: Date): number {
  const hoje = inicioDoDiaEmManaus(diaEmManaus(agora)).getTime();
  const dia = inicioDoDiaEmManaus(diaEmManaus(vencimento)).getTime();
  return Math.round((dia - hoje) / 86_400_000);
}

export type Prazo = { situacao: "no_prazo" | "vence_hoje" | "vencido"; dias: number };

/** Nulo quando o lançamento não vence mais (liquidado ou cancelado). */
export function prazoDoLancamento(l: EstadoDoLancamento, agora: Date): Prazo | null {
  if (!emAberto(l)) return null;
  const dias = diasParaVencer(l.vencimento, agora);
  return { situacao: dias < 0 ? "vencido" : dias === 0 ? "vence_hoje" : "no_prazo", dias };
}

/** "Em cobrança": entrada enviada e vencida. Não é etapa. */
export const emCobranca = (l: EstadoDoLancamento, agora: Date): boolean =>
  l.tipo === "entrada" && l.etapa === "enviada" && l.canceladoEm === null && diasParaVencer(l.vencimento, agora) < 0;

export const colunaDoLancamento = (etapa: EtapaDeLancamento): ColunaDoQuadroFinanceiro => colunaDaEtapa[etapa];

/** CP-0412 para saída e CR-0412 para entrada; o número é global por tipo. */
export const codigoDoLancamento = (tipo: TipoDeLancamento, numero: number): string =>
  `${tipo === "saida" ? "CP" : "CR"}-${String(numero).padStart(4, "0")}`;

/** "CP-0412", "cp 412" ou "412": o número que a busca procura, se houver. */
export function numeroDaBusca(busca: string): { tipo: TipoDeLancamento | null; numero: number } | null {
  const m = /^\s*(?:(cp|cr)\s*-?\s*)?0*(\d{1,9})\s*$/i.exec(busca);
  if (!m) return null;
  const prefixo = m[1]?.toLowerCase();
  return { tipo: prefixo === "cp" ? "saida" : prefixo === "cr" ? "entrada" : null, numero: Number(m[2]) };
}

// ---------------------------------------------------------------- ações

/** As ações que já rodam. As demais do contrato chegam com a PLU-337. */
export const acoesImplementadas: readonly NomeDaAcaoDoLancamento[] = ["aprovar", "cancelar"];

export type Recusa = { codigo: "CONFLITO_ESTADO" | "REQUISICAO_INVALIDA"; mensagem: string };

export type Plano =
  | { tipo: "aprovar"; etapa: "aprovada" }
  | { tipo: "cancelar"; motivo: string };

/** O que a ação faz sobre o estado, ou por que não pode. Não olha o acesso. */
export function planejarAcao(l: EstadoDoLancamento, acao: AcaoDoLancamento): Plano | Recusa {
  if (!acoesImplementadas.includes(acao.acao)) {
    return { codigo: "CONFLITO_ESTADO", mensagem: "Esta ação ainda não está disponível." };
  }
  if (l.canceladoEm !== null) return { codigo: "CONFLITO_ESTADO", mensagem: "O lançamento está cancelado." };
  switch (acao.acao) {
    case "aprovar":
      if (l.tipo !== "saida") return { codigo: "CONFLITO_ESTADO", mensagem: "Só conta a pagar é aprovada." };
      if (l.etapa !== "aberta") return { codigo: "CONFLITO_ESTADO", mensagem: "A conta já foi aprovada." };
      return { tipo: "aprovar", etapa: "aprovada" };
    case "cancelar":
      if (estaLiquidado(l.etapa)) {
        return { codigo: "CONFLITO_ESTADO", mensagem: l.tipo === "saida" ? "Conta já paga não se cancela." : "Cobrança já recebida não se cancela." };
      }
      return { tipo: "cancelar", motivo: acao.motivo };
    default:
      return { codigo: "CONFLITO_ESTADO", mensagem: "Esta ação ainda não está disponível." };
  }
}

/**
 * Acesso por ação. Aprovar é da Gerente do Financeiro (F2). Cancelar a saída já
 * aprovada também, porque desfaz uma aprovação dela; antes disso, e na entrada,
 * basta alcançar o tipo.
 */
export function podeExecutar(papel: PapelNoFinanceiro, l: Pick<EstadoDoLancamento, "tipo" | "etapa">, acao: NomeDaAcaoDoLancamento): boolean {
  if (!alcancaTipo(papel, l.tipo)) return false;
  switch (acao) {
    case "aprovar":
      return papel.gerente;
    case "cancelar":
      return l.tipo === "saida" && l.etapa !== "aberta" ? papel.gerente : true;
    default:
      return true;
  }
}

/** O que a pessoa pode disparar agora: estado certo e acesso. Alimenta `acoesPermitidas`. */
export function acoesPermitidas(l: EstadoDoLancamento, papel: PapelNoFinanceiro): NomeDaAcaoDoLancamento[] {
  return acoesDoLancamento.filter((acao) => {
    if (!acoesImplementadas.includes(acao) || !podeExecutar(papel, l, acao)) return false;
    const exemplo: AcaoDoLancamento = acao === "cancelar" ? { acao, motivo: "x" } : ({ acao } as AcaoDoLancamento);
    return !("codigo" in planejarAcao(l, exemplo));
  });
}

/** Editar vale antes de liquidar e fora do cancelado, para quem alcança o tipo. */
export const podeEditar = (l: EstadoDoLancamento, papel: PapelNoFinanceiro): boolean => alcancaTipo(papel, l.tipo) && emAberto(l);

/**
 * O que a aprovação da Gerente cobre (F2): para quem e de onde sai o dinheiro, e
 * quando. Na saída já aprovada, só ela muda esses campos; senão a aprovação seria
 * contornável por uma edição antes de pagar.
 */
export const camposDaAprovacao = ["fornecedorId", "contaCorrenteId", "forma", "vencimento"] as const;

export type ProblemaDaEdicao = { codigo: "CONFLITO_ESTADO" | "REQUISICAO_INVALIDA" | "ACESSO_NEGADO"; mensagem: string; campo?: string };

/** Por que a edição não pode, ou nulo. `campos` são os nomes dos campos enviados. */
export function problemaDaEdicao(
  l: EstadoDoLancamento & { origem: OrigemDoLancamento },
  campos: readonly string[],
  papel: PapelNoFinanceiro,
): ProblemaDaEdicao | null {
  if (!podeEditar(l, papel)) return { codigo: "CONFLITO_ESTADO", mensagem: "Lançamento pago, recebido ou cancelado não se edita." };
  if (campos.includes("fornecedorId") && l.tipo !== "saida") {
    return { codigo: "REQUISICAO_INVALIDA", mensagem: "Cobrança não tem fornecedor.", campo: "fornecedorId" };
  }
  // Na conta que nasceu do pedido, o fornecedor é o da cotação aprovada.
  if (campos.includes("fornecedorId") && l.origem === "pedido_de_compra") {
    return { codigo: "REQUISICAO_INVALIDA", mensagem: "O fornecedor vem da cotação aprovada do pedido de compra.", campo: "fornecedorId" };
  }
  if (l.tipo === "saida" && l.etapa === "aprovada" && !papel.gerente && campos.some((c) => (camposDaAprovacao as readonly string[]).includes(c))) {
    return { codigo: "ACESSO_NEGADO", mensagem: "Na conta aprovada, só a Gerente do Financeiro muda fornecedor, conta, forma ou vencimento." };
  }
  return null;
}

// ---------------------------------------------------------------- filtro de Situação

/**
 * Condição de cada id do filtro de Situação, em termos neutros para o
 * repositório traduzir: tipos, etapas, vencido e OMIE. `cancelado` é o único que
 * mostra cancelados; os demais excluem.
 */
export type CondicaoDaSituacao = {
  tipos?: TipoDeLancamento[];
  etapas?: EtapaDeLancamento[];
  /** true: só em aberto e vencido antes de hoje. */
  vencido?: boolean;
  /** true: só em aberto. */
  emAberto?: boolean;
  omieComErro?: boolean;
  cancelado: boolean;
};

export function condicaoDaSituacao(situacao: SituacaoDoFiltroFinanceiro | undefined): CondicaoDaSituacao {
  switch (situacao) {
    case undefined:
      return { cancelado: false };
    case "pagar":
      return { tipos: ["saida"], emAberto: true, cancelado: false };
    case "pagar-aberto":
      return { tipos: ["saida"], etapas: ["aberta"], cancelado: false };
    case "pagar-aprovado":
      return { tipos: ["saida"], etapas: ["aprovada"], cancelado: false };
    case "pagar-vencido":
      return { tipos: ["saida"], vencido: true, cancelado: false };
    case "receber":
      return { tipos: ["entrada"], emAberto: true, cancelado: false };
    case "receber-gerado":
      return { tipos: ["entrada"], etapas: ["gerada", "nf_emitida", "boleto_gerado"], cancelado: false };
    case "receber-cobranca":
      return { tipos: ["entrada"], etapas: ["enviada"], cancelado: false };
    case "receber-vencido":
      return { tipos: ["entrada"], vencido: true, cancelado: false };
    case "concluido":
      return { etapas: ["paga", "recebida", "conciliada"], cancelado: false };
    case "pago":
      return { tipos: ["saida"], etapas: ["paga"], cancelado: false };
    case "recebido":
      return { tipos: ["entrada"], etapas: ["recebida"], cancelado: false };
    case "conciliado":
      return { etapas: ["conciliada"], cancelado: false };
    case "vencidos":
      return { vencido: true, cancelado: false };
    case "erro":
      return { omieComErro: true, cancelado: false };
    case "cancelado":
      return { cancelado: true };
  }
}

/** Etapas em aberto (nem liquidadas): o que vence. */
export const etapasEmAberto: EtapaDeLancamento[] = ["aberta", "aprovada", "gerada", "nf_emitida", "boleto_gerado", "enviada"];

/** Último dia do mês de `agora` em Manaus, "aaaa-mm-dd". */
export function fimDoMesEmManaus(agora: Date): string {
  const [ano, mes] = diaEmManaus(agora).split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;
}

/** Primeiro dia do mês de `agora` em Manaus, "aaaa-mm-dd". */
export const inicioDoMesEmManaus = (agora: Date): string => `${diaEmManaus(agora).slice(0, 7)}-01`;
