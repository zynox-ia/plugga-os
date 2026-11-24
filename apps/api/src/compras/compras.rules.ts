import {
  acoesDoPedido,
  alcancaDepartamento,
  alcancaTela,
  PRAZO_DA_ETAPA_DE_COMPRA_EM_DIAS_UTEIS,
  type Acesso,
  type AcaoDoPedido,
  type EtapaDeCompra,
  type EtapaDeCompraComPrazo,
  type FormaDePagamento,
  type NomeDaAcaoDoPedido,
  type OrigemDoAtendimento,
  type SituacaoDoPedido,
} from "@plugga/shared";

import { adicionarDiasUteis, cumpriuPrazo, diaEmManaus, inicioDoDiaEmManaus } from "./dias-uteis";

/**
 * Regras do pedido de compra (PLU-327), puras: dado o estado do pedido, a ação
 * e o instante, devolvem o plano que o repositório aplica numa transação, ou o
 * motivo da recusa. Nada aqui lê banco ou relógio.
 */

export type EstadoDoPedido = {
  etapa: EtapaDeCompra;
  canceladoEm: Date | null;
  origemAtendimento: OrigemDoAtendimento | null;
  cotacaoSelecionadaId: string | null;
  /** As cotações do pedido, com o que as regras precisam delas. */
  cotacoes: readonly { id: string; valorTotal: string; prazoEntregaDias: number | null }[];
  /** A passagem aberta, se houver. Pedido em andamento sempre tem uma. */
  passagemAberta: { prazoEm: Date } | null;
  /** Quando o pedido foi criado: o recebimento não pode ser anterior a ele. */
  criadoEm?: Date;
};

export type Recusa = { codigo: "CONFLITO_ESTADO" | "REQUISICAO_INVALIDA"; mensagem: string };

export type NomeDoEventoDeCompra =
  | "compras.pedido.analise_iniciada"
  | "compras.pedido.estoque_decidido"
  | "compras.pedido.cotacao_selecionada"
  | "compras.pedido.enviado_para_aprovacao"
  | "compras.pedido.aprovado"
  | "compras.pedido.revisado"
  | "compras.pedido.pagamento_registrado"
  | "compras.pedido.recebimento_confirmado"
  | "compras.pedido.cancelado";

/** Colunas do pedido que a ação muda. Os campos de autoria (quem e quando) o repositório preenche a partir do principal. */
export type AlteracoesDoPedido = {
  etapa?: EtapaDeCompra;
  origemAtendimento?: OrigemDoAtendimento;
  cotacaoSelecionadaId?: string | null;
  valorCotado?: string | null;
  valorFaturado?: string | null;
  concluidoEm?: Date;
  canceladoEm?: Date;
  motivoCancelamento?: string;
  formaPagamento?: FormaDePagamento;
};

export type PlanoDaAcao = {
  alteracoes: AlteracoesDoPedido;
  /** Fecha a passagem aberta com este resultado de prazo. */
  fecharPassagem: { saiuEm: Date; cumpriuPrazo: boolean } | null;
  /** Abre a passagem da nova etapa. */
  abrirPassagem: { etapa: EtapaDeCompraComPrazo; entrouEm: Date; prazoDiasUteis: number; prazoEm: Date } | null;
  evento: NomeDoEventoDeCompra;
};

export type Resultado = { ok: true; plano: PlanoDaAcao } | { ok: false; recusa: Recusa };

/** Etapa em que cada ação vale. `cancelar` vale em qualquer etapa em andamento. */
const etapaDaAcao: Readonly<Record<Exclude<NomeDaAcaoDoPedido, "cancelar">, EtapaDeCompraComPrazo>> = {
  iniciar_analise: "pedido_gerado",
  decidir_estoque: "analise_estoque",
  selecionar_cotacao: "cotacoes",
  enviar_para_aprovacao: "cotacoes",
  aprovar: "aprovacao_compra",
  revisar: "aprovacao_compra",
  registrar_pagamento: "pagamento",
  confirmar_recebimento: "retirada",
};

export function situacaoDoPedido(pedido: { etapa: EtapaDeCompra; canceladoEm: Date | null }): SituacaoDoPedido {
  if (pedido.canceladoEm) return "cancelado";
  return pedido.etapa === "concluido" ? "concluido" : "em_andamento";
}

/** Prazo da etapa: a constante de `@plugga/shared`, e na retirada de aquisição o prazo do fornecedor, se maior. */
export function prazoDaEtapa(etapa: EtapaDeCompraComPrazo, origem: OrigemDoAtendimento | null, prazoDoFornecedorDias: number | null): number {
  const base = PRAZO_DA_ETAPA_DE_COMPRA_EM_DIAS_UTEIS[etapa];
  if (etapa === "retirada" && origem === "aquisicao" && prazoDoFornecedorDias !== null && prazoDoFornecedorDias > base) {
    return prazoDoFornecedorDias;
  }
  return base;
}

/** Passagem de entrada de um pedido novo. */
export function passagemInicial(agora: Date): NonNullable<PlanoDaAcao["abrirPassagem"]> {
  return abrir("pedido_gerado", agora, null, null);
}

function abrir(etapa: EtapaDeCompraComPrazo, agora: Date, origem: OrigemDoAtendimento | null, prazoDoFornecedorDias: number | null) {
  const prazoDiasUteis = prazoDaEtapa(etapa, origem, prazoDoFornecedorDias);
  return { etapa, entrouEm: agora, prazoDiasUteis, prazoEm: adicionarDiasUteis(agora, prazoDiasUteis) };
}

const recusa = (codigo: Recusa["codigo"], mensagem: string): Resultado => ({ ok: false, recusa: { codigo, mensagem } });

export function planejarAcao(pedido: EstadoDoPedido, acao: AcaoDoPedido, agora: Date): Resultado {
  const situacao = situacaoDoPedido(pedido);
  if (situacao !== "em_andamento") {
    return recusa("CONFLITO_ESTADO", situacao === "cancelado" ? "O pedido está cancelado." : "O pedido já foi concluído.");
  }
  if (acao.acao !== "cancelar" && pedido.etapa !== etapaDaAcao[acao.acao]) {
    return recusa("CONFLITO_ESTADO", "Esta ação não vale na etapa atual do pedido. Atualize a tela.");
  }

  const fechar = pedido.passagemAberta ? { saiuEm: agora, cumpriuPrazo: cumpriuPrazo(agora, pedido.passagemAberta.prazoEm) } : null;
  const mover = (etapa: EtapaDeCompraComPrazo, evento: NomeDoEventoDeCompra, alteracoes: AlteracoesDoPedido = {}, origem = pedido.origemAtendimento, prazoDoFornecedor: number | null = null): Resultado => ({
    ok: true,
    plano: { alteracoes: { ...alteracoes, etapa }, fecharPassagem: fechar, abrirPassagem: abrir(etapa, agora, origem, prazoDoFornecedor), evento },
  });

  switch (acao.acao) {
    case "iniciar_analise":
      return mover("analise_estoque", "compras.pedido.analise_iniciada");

    case "decidir_estoque":
      return acao.origem === "estoque"
        ? mover("retirada", "compras.pedido.estoque_decidido", { origemAtendimento: "estoque" }, "estoque")
        : mover("cotacoes", "compras.pedido.estoque_decidido", { origemAtendimento: "aquisicao" }, "aquisicao");

    case "selecionar_cotacao": {
      const cotacao = pedido.cotacoes.find((item) => item.id === acao.cotacaoId);
      if (!cotacao) return recusa("REQUISICAO_INVALIDA", "A cotação não pertence a este pedido.");
      return {
        ok: true,
        plano: {
          alteracoes: { cotacaoSelecionadaId: cotacao.id, valorCotado: cotacao.valorTotal },
          fecharPassagem: null,
          abrirPassagem: null,
          evento: "compras.pedido.cotacao_selecionada",
        },
      };
    }

    case "enviar_para_aprovacao":
      if (!pedido.cotacaoSelecionadaId) return recusa("CONFLITO_ESTADO", "Escolha uma cotação antes de enviar para aprovação.");
      return mover("aprovacao_compra", "compras.pedido.enviado_para_aprovacao");

    case "aprovar":
      return mover("pagamento", "compras.pedido.aprovado");

    case "revisar":
      return mover("cotacoes", "compras.pedido.revisado", { cotacaoSelecionadaId: null, valorCotado: null });

    case "registrar_pagamento": {
      const selecionada = pedido.cotacoes.find((item) => item.id === pedido.cotacaoSelecionadaId);
      return mover("retirada", "compras.pedido.pagamento_registrado", { formaPagamento: acao.forma }, pedido.origemAtendimento, selecionada?.prazoEntregaDias ?? null);
    }

    case "confirmar_recebimento": {
      if (acao.recebidoEm > diaEmManaus(agora)) return recusa("REQUISICAO_INVALIDA", "O dia do recebimento não pode ser futuro.");
      if (pedido.criadoEm && acao.recebidoEm < diaEmManaus(pedido.criadoEm)) {
        return recusa("REQUISICAO_INVALIDA", "O dia do recebimento não pode ser anterior à criação do pedido.");
      }
      const valorFaturado = acao.valorFaturado ?? null;
      if (pedido.origemAtendimento === "aquisicao" && valorFaturado === null) {
        return recusa("REQUISICAO_INVALIDA", "Informe o valor faturado da compra.");
      }
      return {
        ok: true,
        plano: {
          alteracoes: { etapa: "concluido", concluidoEm: agora, valorFaturado },
          fecharPassagem: fechar,
          abrirPassagem: null,
          evento: "compras.pedido.recebimento_confirmado",
        },
      };
    }

    case "cancelar":
      return {
        ok: true,
        plano: {
          alteracoes: { canceladoEm: agora, motivoCancelamento: acao.motivo },
          fecharPassagem: fechar,
          abrirPassagem: null,
          evento: "compras.pedido.cancelado",
        },
      };
  }
}

// ---------------------------------------------------------------- acesso

/**
 * Sem segregação de função nesta entrega (André, 23/11/2026): quem opera
 * Compras faz tudo menos aprovar e pagar. Aprovar e revisar ficam com o
 * gerente do Financeiro; pagar, com quem é do Financeiro. Admin alcança tudo.
 * Quem é do Financeiro também cancela e vê os pedidos, para decidir sobre eles.
 */
export type PapelEmCompras = { operaCompras: boolean; membroDoFinanceiro: boolean; gerenteDoFinanceiro: boolean };

export function papelEmCompras(acesso: Acesso | undefined): PapelEmCompras {
  if (!acesso) return { operaCompras: false, membroDoFinanceiro: false, gerenteDoFinanceiro: false };
  return {
    operaCompras: alcancaTela(acesso, "suprimentos.compras"),
    membroDoFinanceiro: alcancaDepartamento(acesso, "financeiro", "membro"),
    gerenteDoFinanceiro: alcancaDepartamento(acesso, "financeiro", "gerente"),
  };
}

export const podeVerCompras = (papel: PapelEmCompras): boolean => papel.operaCompras || papel.membroDoFinanceiro;

export function podeExecutar(papel: PapelEmCompras, acao: NomeDaAcaoDoPedido): boolean {
  switch (acao) {
    case "aprovar":
    case "revisar":
      return papel.gerenteDoFinanceiro;
    case "registrar_pagamento":
      return papel.membroDoFinanceiro;
    case "cancelar":
      return papel.operaCompras || papel.gerenteDoFinanceiro;
    default:
      return papel.operaCompras;
  }
}

/** As ações que a pessoa pode disparar agora: etapa certa e acesso. Alimenta `acoesPermitidas`. */
export function acoesPermitidas(pedido: Pick<EstadoDoPedido, "etapa" | "canceladoEm">, papel: PapelEmCompras): NomeDaAcaoDoPedido[] {
  if (situacaoDoPedido(pedido) !== "em_andamento") return [];
  return acoesDoPedido.filter((acao) => (acao === "cancelar" || etapaDaAcao[acao] === pedido.etapa) && podeExecutar(papel, acao));
}

/** Cotação nova só na etapa de cotações de um pedido em andamento. */
export const aceitaCotacao = (pedido: Pick<EstadoDoPedido, "etapa" | "canceladoEm">): boolean =>
  situacaoDoPedido(pedido) === "em_andamento" && pedido.etapa === "cotacoes";

/** Comprovante só enquanto o pagamento não foi registrado. */
export const aceitaComprovante = (pedido: Pick<EstadoDoPedido, "etapa" | "canceladoEm">): boolean =>
  situacaoDoPedido(pedido) === "em_andamento" && pedido.etapa === "pagamento";

/** Edição dos dados vale em andamento; os itens só até a análise de estoque. */
export function problemaDaEdicao(pedido: Pick<EstadoDoPedido, "etapa" | "canceladoEm">, mudaItens: boolean): Recusa | null {
  if (situacaoDoPedido(pedido) !== "em_andamento") return { codigo: "CONFLITO_ESTADO", mensagem: "Pedido concluído ou cancelado não é editado." };
  if (mudaItens && pedido.etapa !== "pedido_gerado" && pedido.etapa !== "analise_estoque") {
    return { codigo: "CONFLITO_ESTADO", mensagem: "Os itens só mudam até a análise de estoque." };
  }
  return null;
}

/** valor + frete, em centavos para não somar ponto flutuante. */
export function somarValores(valor: string, frete: string | null): string {
  const centavos = (v: string) => {
    const [inteiro = "0", fracao = ""] = v.split(".");
    return BigInt(inteiro) * 100n + BigInt((fracao + "00").slice(0, 2));
  };
  const total = centavos(valor) + (frete === null ? 0n : centavos(frete));
  return `${total / 100n}.${String(total % 100n).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- autoria

/** Colunas de "quem fez e quando" que cada ação grava no pedido (sem segregação, mas com rastro). */
export type AutoriaDoPedido = {
  estoqueDecididoEm?: Date;
  estoqueDecididoPorId?: string;
  cotacaoSelecionadaEm?: Date | null;
  selecionouCotacaoId?: string | null;
  aprovadoEm?: Date;
  aprovouId?: string;
  pagamentoRegistradoEm?: Date;
  pagamentoRegistradoPorId?: string;
  pagamentoObservacao?: string | null;
  recebimentoConfirmadoPorId?: string;
  recebidoEm?: Date;
  canceladoPorId?: string;
};

export function autoriaDaAcao(acao: AcaoDoPedido, pessoaId: string, agora: Date): AutoriaDoPedido {
  switch (acao.acao) {
    case "decidir_estoque":
      return { estoqueDecididoEm: agora, estoqueDecididoPorId: pessoaId };
    case "selecionar_cotacao":
      return { cotacaoSelecionadaEm: agora, selecionouCotacaoId: pessoaId };
    case "revisar":
      // A proposta voltou: a escolha da cotação deixa de valer, e quem escolheu também.
      return { cotacaoSelecionadaEm: null, selecionouCotacaoId: null };
    case "aprovar":
      return { aprovadoEm: agora, aprovouId: pessoaId };
    case "registrar_pagamento":
      return { pagamentoRegistradoEm: agora, pagamentoRegistradoPorId: pessoaId, pagamentoObservacao: acao.observacao ?? null };
    case "confirmar_recebimento":
      return { recebimentoConfirmadoPorId: pessoaId, recebidoEm: inicioDoDiaEmManaus(acao.recebidoEm) };
    case "cancelar":
      return { canceladoPorId: pessoaId };
    default:
      return {};
  }
}

/** O texto que a ação deixa na passagem que ela fecha: o motivo, ou a observação. */
export function observacaoDaAcao(acao: AcaoDoPedido): string | null {
  if (acao.acao === "revisar" || acao.acao === "cancelar") return acao.motivo;
  if (acao.acao === "selecionar_cotacao") return null;
  return acao.observacao ?? null;
}
