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
  type FormaDoLancamento,
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

/**
 * As origens que nascem pagas (ou recebidas) na Conciliação (PLU-339, C5). A saída delas não
 * passa pela aprovação F2: `pagoSemAprovacao` é a marca consultável disso.
 */
export const origensPagasSemAprovacao = ["tarifa_bancaria", "conciliacao"] as const;
export const pagoSemAprovacao = (l: { tipo: TipoDeLancamento; origem: string }): boolean =>
  l.tipo === "saida" && (origensPagasSemAprovacao as readonly string[]).includes(l.origem);

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

/** A transferência entre contas (C6): TR-0012. */
export const codigoDaTransferencia = (numero: number): string => `TR-${String(numero).padStart(4, "0")}`;

/**
 * CP-0412 para saída e CR-0412 para entrada; o número é global por tipo. A perna de uma
 * transferência (C6) leva o número dela: "TR-0012 · saída" e "TR-0012 · entrada".
 */
export const codigoDoLancamento = (tipo: TipoDeLancamento, numero: number, origem?: string): string =>
  origem === "transferencia"
    ? `${codigoDaTransferencia(numero)} · ${tipo === "saida" ? "saída" : "entrada"}`
    : `${tipo === "saida" ? "CP" : "CR"}-${String(numero).padStart(4, "0")}`;

/**
 * A outra perna de uma transferência, vista de uma delas. O código sai do sentido oposto (é
 * sempre o outro tipo); o id é nulo quando o RLS esconde a outra perna (quem só tem Contas a
 * receber não lê a saída, e vice-versa).
 */
export function outraPernaDaTransferencia(
  perna: { id: string; tipo: TipoDeLancamento },
  numero: number,
  visiveis: readonly { id: string; tipo: TipoDeLancamento }[],
): { id: string | null; codigo: string } {
  const tipo: TipoDeLancamento = perna.tipo === "saida" ? "entrada" : "saida";
  return { id: visiveis.find((p) => p.id !== perna.id && p.tipo === tipo)?.id ?? null, codigo: codigoDoLancamento(tipo, numero, "transferencia") };
}

/** As pernas de uma transferência entre contas: não são receita nem despesa (fora dos cards e das ações). */
export const ehTransferencia = (l: { origem: string }): boolean => l.origem === "transferencia";

/**
 * "CP-0412", "cp 412", "TR-12" ou "412": o número que a busca procura, se houver. Com TR, só as
 * pernas das transferências; com CP ou CR, só fora delas.
 */
export function numeroDaBusca(busca: string): { tipo: TipoDeLancamento | null; numero: number; transferencia?: boolean } | null {
  const m = /^\s*(?:(cp|cr|tr)\s*-?\s*)?0*(\d{1,9})\s*$/i.exec(busca);
  if (!m) return null;
  const prefixo = m[1]?.toLowerCase();
  if (prefixo === "tr") return { tipo: null, numero: Number(m[2]), transferencia: true };
  return { tipo: prefixo === "cp" ? "saida" : prefixo === "cr" ? "entrada" : null, numero: Number(m[2]), ...(prefixo ? { transferencia: false } : {}) };
}

// ---------------------------------------------------------------- ações

/**
 * O que dos anexos importa para as transições (PLU-337). `boletoNovo`: o boleto atual
 * foi anexado depois do registro do boleto e da última correção de valor.
 */
export type AnexosAtuais = { comprovante: boolean; boleto: boolean; boletoNovo?: boolean };
export const SEM_ANEXOS: AnexosAtuais = { comprovante: false, boleto: false, boletoNovo: false };

export type Recusa = { codigo: "CONFLITO_ESTADO" | "REQUISICAO_INVALIDA"; mensagem: string; campo?: string };

export type Plano =
  | { tipo: "aprovar"; etapa: "aprovada" }
  | { tipo: "cancelar"; motivo: string }
  | { tipo: "corrigir_valor"; valor: string; motivo: string }
  | { tipo: "registrar_nf"; etapa: "nf_emitida"; numero: string }
  | { tipo: "registrar_boleto"; etapa: "boleto_gerado" }
  | { tipo: "registrar_envio"; etapa: "enviada"; canal: string }
  | { tipo: "registrar_cobranca"; canal: string; nota: string | null }
  | { tipo: "registrar_pagamento"; etapa: "paga"; forma: FormaDoLancamento; contaCorrenteId: string; pagoEm: string }
  | { tipo: "registrar_recebimento"; etapa: "recebida"; contaCorrenteId: string; recebidoEm: string; valor: string };

const conflito = (mensagem: string, campo?: string): Recusa => ({ codigo: "CONFLITO_ESTADO", mensagem, ...(campo ? { campo } : {}) });
const soEntrada = (l: EstadoDoLancamento) => (l.tipo === "entrada" ? null : conflito("Só a cobrança tem esta etapa."));
const etapaExigida = (l: EstadoDoLancamento, etapas: EtapaDeLancamento[], mensagem: string) => (etapas.includes(l.etapa) ? null : conflito(mensagem));

/**
 * O que a ação faz sobre o estado, ou por que não pode. Não olha o acesso. `agora`
 * decide os dias que não podem ser futuros (pagamento e recebimento, em Manaus).
 */
export function planejarAcao(l: EstadoDoLancamento, acao: AcaoDoLancamento, anexos: AnexosAtuais, agora: Date): Plano | Recusa {
  if (l.canceladoEm !== null) return conflito("O lançamento está cancelado.");
  const hoje = diaEmManaus(agora);
  switch (acao.acao) {
    case "aprovar":
      if (l.tipo !== "saida") return conflito("Só conta a pagar é aprovada.");
      if (l.etapa !== "aberta") return conflito("A conta já foi aprovada.");
      return { tipo: "aprovar", etapa: "aprovada" };
    case "cancelar":
      if (estaLiquidado(l.etapa)) return conflito(l.tipo === "saida" ? "Conta já paga não se cancela." : "Cobrança já recebida não se cancela.");
      return { tipo: "cancelar", motivo: acao.motivo };
    case "corrigir_valor":
      // O liquidado e ainda não conciliado se corrige (o "Valor diferente" da Conciliação: juros,
      // multa ou desconto). Depois de conciliado, o par com o extrato vem antes: desfaz primeiro.
      if (l.etapa === "conciliada") return conflito("Depois de conciliado, o valor não se corrige: desfaça a conciliação primeiro.");
      // Decisão (a) do Coordenador: depois do boleto, o boleto com o valor antigo não
      // serve; corrigir exige anexar o boleto novo antes (o antigo fica substituído).
      if (l.tipo === "entrada" && (l.etapa === "boleto_gerado" || l.etapa === "enviada") && !anexos.boletoNovo) {
        return conflito("Anexe o boleto com o valor novo antes de corrigir.", "boleto");
      }
      return { tipo: "corrigir_valor", valor: acao.valor, motivo: acao.motivo };
    case "registrar_nf":
      return soEntrada(l) ?? etapaExigida(l, ["gerada"], "A NF é registrada na cobrança gerada.") ?? { tipo: "registrar_nf", etapa: "nf_emitida", numero: acao.numero };
    case "registrar_boleto":
      return soEntrada(l) ?? etapaExigida(l, ["nf_emitida"], "O boleto vem depois da NF.")
        ?? (anexos.boleto ? { tipo: "registrar_boleto", etapa: "boleto_gerado" } : conflito("Anexe o boleto antes de registrá-lo.", "boleto"));
    case "registrar_envio":
      return soEntrada(l) ?? etapaExigida(l, ["boleto_gerado"], "A cobrança é enviada depois do boleto.") ?? { tipo: "registrar_envio", etapa: "enviada", canal: acao.canal };
    case "registrar_cobranca":
      return soEntrada(l) ?? etapaExigida(l, ["enviada"], "Cobrança registra-se na cobrança enviada.") ?? { tipo: "registrar_cobranca", canal: acao.canal, nota: acao.nota ?? null };
    case "registrar_pagamento":
      if (l.tipo !== "saida") return conflito("Só conta a pagar é paga.");
      if (l.etapa !== "aprovada") return conflito(l.etapa === "aberta" ? "A conta precisa ser aprovada antes de paga." : "A conta já foi paga.");
      if (acao.pagoEm > hoje) return { codigo: "REQUISICAO_INVALIDA", mensagem: "O dia do pagamento não pode ser futuro.", campo: "pagoEm" };
      if (!anexos.comprovante) return conflito("Anexe o comprovante antes de pagar.", "comprovante");
      return { tipo: "registrar_pagamento", etapa: "paga", forma: acao.forma, contaCorrenteId: acao.contaCorrenteId, pagoEm: acao.pagoEm };
    case "registrar_recebimento":
      return soEntrada(l) ?? etapaExigida(l, ["boleto_gerado", "enviada"], "A cobrança recebe-se depois do boleto.")
        ?? (acao.recebidoEm > hoje
          ? { codigo: "REQUISICAO_INVALIDA", mensagem: "O dia do recebimento não pode ser futuro.", campo: "recebidoEm" }
          : { tipo: "registrar_recebimento", etapa: "recebida", contaCorrenteId: acao.contaCorrenteId, recebidoEm: acao.recebidoEm, valor: acao.valor });
  }
}

/**
 * Acesso por ação. Aprovar é da Gerente do Financeiro (F2). Cancelar ou corrigir o
 * valor da saída já aprovada também, porque mexe numa aprovação dela; corrigir o valor
 * do que já foi pago ou recebido também, nos dois tipos. O resto basta alcançar o tipo
 * (pagar e receber são de qualquer membro).
 */
export function podeExecutar(papel: PapelNoFinanceiro, l: Pick<EstadoDoLancamento, "tipo" | "etapa">, acao: NomeDaAcaoDoLancamento): boolean {
  if (!alcancaTipo(papel, l.tipo)) return false;
  switch (acao) {
    case "aprovar":
      return papel.gerente;
    case "cancelar":
      return l.tipo === "saida" && l.etapa !== "aberta" ? papel.gerente : true;
    case "corrigir_valor":
      return (l.tipo === "saida" && l.etapa !== "aberta") || estaLiquidado(l.etapa) ? papel.gerente : true;
    default:
      return true;
  }
}

/** Um exemplo válido de cada ação, para perguntar ao `planejarAcao` se cabe agora. */
function exemploDe(acao: NomeDaAcaoDoLancamento, agora: Date): AcaoDoLancamento {
  const ontem = diaEmManaus(new Date(agora.getTime() - 86_400_000));
  const id = "00000000-0000-0000-0000-000000000000";
  switch (acao) {
    case "cancelar": return { acao, motivo: "x" };
    case "corrigir_valor": return { acao, valor: "1.00", motivo: "x" };
    case "registrar_nf": return { acao, numero: "x" };
    case "registrar_envio": return { acao, canal: "x" };
    case "registrar_cobranca": return { acao, canal: "x", nota: null };
    case "registrar_pagamento": return { acao, forma: "pix", contaCorrenteId: id, pagoEm: ontem };
    case "registrar_recebimento": return { acao, contaCorrenteId: id, recebidoEm: ontem, valor: "1.00" };
    default: return { acao } as AcaoDoLancamento;
  }
}

/**
 * O que a pessoa pode disparar agora: estado certo e acesso. Alimenta `acoesPermitidas`.
 * O pagamento aparece mesmo sem o comprovante anexado: a tela o habilita depois do anexo.
 */
export function acoesPermitidas(l: EstadoDoLancamento, papel: PapelNoFinanceiro, anexos: AnexosAtuais, agora: Date): NomeDaAcaoDoLancamento[] {
  const comTudo = { comprovante: true, boleto: true, boletoNovo: true };
  return acoesDoLancamento.filter((acao) => {
    if (!podeExecutar(papel, l, acao)) return false;
    // O que só depende de um anexo aparece mesmo sem ele: a tela habilita depois do anexo.
    const dependeDeAnexo = acao === "registrar_pagamento" || acao === "registrar_boleto" || acao === "corrigir_valor";
    const plano = planejarAcao(l, exemploDe(acao, agora), dependeDeAnexo ? comTudo : anexos, agora);
    return !("codigo" in plano);
  });
}

/** O painel "O que falta", na ordem do fluxo. */
export function pendenciasDoLancamento(
  l: EstadoDoLancamento & { categoriaId?: string | null },
  anexos: AnexosAtuais,
): { texto: string; feito: boolean; opcional?: boolean }[] {
  const passou = (etapas: readonly EtapaDeLancamento[]) => etapas.includes(l.etapa);
  if (l.tipo === "saida") {
    return [
      // A despesa pode nascer sem categoria (CC14): a classificação entra no painel, sem travar o fluxo.
      ...(l.categoriaId === null ? [{ texto: "Classificar a categoria", feito: false }] : []),
      { texto: "Aprovar", feito: passou(["aprovada", "paga", "conciliada"]) },
      { texto: "Anexar o comprovante", feito: anexos.comprovante },
      { texto: "Registrar o pagamento", feito: passou(["paga", "conciliada"]) },
      { texto: "Conciliar com o extrato", feito: l.etapa === "conciliada" },
    ];
  }
  return [
    { texto: "Emitir a NF", feito: passou(["nf_emitida", "boleto_gerado", "enviada", "recebida", "conciliada"]) },
    { texto: "Gerar o boleto", feito: passou(["boleto_gerado", "enviada", "recebida", "conciliada"]) },
    { texto: "Enviar ao cliente", feito: passou(["enviada", "recebida", "conciliada"]) },
    { texto: "Anexar o comprovante do recebimento", feito: anexos.comprovante, opcional: true },
    { texto: "Registrar o recebimento", feito: passou(["recebida", "conciliada"]) },
    { texto: "Conciliar com o extrato", feito: l.etapa === "conciliada" },
  ];
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
 * repositório traduzir: tipos, etapas e vencido. `cancelado` é o único que
 * mostra cancelados; os demais excluem.
 */
export type CondicaoDaSituacao = {
  tipos?: TipoDeLancamento[];
  etapas?: EtapaDeLancamento[];
  /** true: só em aberto e vencido antes de hoje. */
  vencido?: boolean;
  /** true: só em aberto. */
  emAberto?: boolean;
  /** true: só as pernas das transferências entre contas (C6). */
  transferencias?: boolean;
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
    case "cancelado":
      return { cancelado: true };
    case "transferencias":
      return { transferencias: true, cancelado: false };
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
