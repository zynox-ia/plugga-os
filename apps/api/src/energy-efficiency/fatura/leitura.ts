import type { InvoiceData } from "@plugga/shared";

import { conferir, type Conferencia } from "./conferencia.js";
import { identificar, type IdentificacaoDaFatura } from "./identificacao.js";
import { lerItens, type ItemDaFatura } from "./itens.js";
import { extrairTexto, type OrigemDoTexto } from "./texto-do-pdf.js";

/**
 * Leitura de uma fatura da distribuidora em PDF.
 *
 * A promessa deste módulo **não** é ler toda fatura — é nunca devolver um
 * número errado em silêncio. Todo campo sai de um item cuja multiplicação
 * fechou, ou sai marcado para conferência humana. Fatura que o módulo não sabe
 * ler falha alto, com o motivo, em vez de entregar ficha pela metade.
 *
 * No corpus real de 73 faturas do CRM, três quartos são digitalização e exigem
 * OCR — que este módulo não faz. Para essas, a resposta é `digitalizacao`, e o
 * caminho é a ficha manual ou uma etapa de OCR à frente. A conferência
 * aritmética, essa sim, vale para qualquer origem: é a mesma função que pega
 * erro de OCR e erro de digitação.
 */

export type MotivoDeRecusa =
  | "digitalizacao"
  | "sem_itens"
  | "grupo_b"
  | "campos_essenciais_ausentes";

export type LeituraDaFatura = {
  origem: OrigemDoTexto;
  /** Falso quando não deu para montar a ficha; `motivo` diz por quê. */
  aproveitavel: boolean;
  motivo: MotivoDeRecusa | null;
  identificacao: IdentificacaoDaFatura;
  itens: ItemDaFatura[];
  conferencia: Conferencia;
  /**
   * Ficha montada com o que foi confirmado. Os campos que a fatura não publica
   * na camada de texto ficam nulos de propósito — ver `camposParaConfirmar`.
   */
  invoice: Partial<InvoiceData>;
  /**
   * Campos que a pessoa precisa preencher ou confirmar antes de calcular.
   * Nunca é vazio por acidente: é o contrato de honestidade da leitura.
   */
  camposParaConfirmar: string[];
};

/** Casa o rótulo impresso com o campo da ficha. */
const CONSUMO_PONTA = /^consumo\s+p(onta)?\b/i;
const CONSUMO_FORA_PONTA = /^consumo\s+f[./-]?\s*ponta\b/i;
const DEMANDA_PONTA = /^demanda\s+p(onta)?\b/i;
const DEMANDA_FORA_PONTA = /^demanda\s+f[./-]?\s*ponta\b/i;
const DEMANDA_SIMPLES = /^demanda\b(?!\s*(gera|ultr))/i;
const REATIVO = /^en\s*r\s*exc\b|reativ/i;
const ULTRAPASSAGEM = /^dem\s*ultr/i;

const soma = (a: number | undefined, b: number): number => (a ?? 0) + b;

export function lerFatura(pdf: Buffer): LeituraDaFatura {
  const texto = extrairTexto(pdf);
  const vazia: Conferencia = {
    itens: [],
    confirmados: 0,
    divergentes: 0,
    semConferencia: 0,
    temDivergencia: false,
  };

  if (texto.origem === "digitalizacao") {
    return {
      origem: texto.origem,
      aproveitavel: false,
      motivo: "digitalizacao",
      identificacao: { unidadeConsumidora: null, competencia: null, distribuidora: null },
      itens: [],
      conferencia: vazia,
      invoice: {},
      camposParaConfirmar: ["a fatura é imagem digitalizada: preencha a ficha à mão"],
    };
  }

  const identificacao = identificar(texto.linhas);
  const itens = lerItens(texto.linhas);
  const conferencia = conferir(itens);

  if (itens.length === 0) {
    return {
      origem: texto.origem,
      aproveitavel: false,
      motivo: "sem_itens",
      identificacao,
      itens,
      conferencia,
      invoice: {},
      camposParaConfirmar: ["layout não reconhecido: nenhum item financeiro identificado"],
    };
  }

  const invoice: Partial<InvoiceData> = {};
  const paraConfirmar: string[] = [];

  // Só item confirmado pela aritmética entra na ficha. Divergente vira pedido
  // de conferência: é exatamente onde o OCR e a digitação erram.
  for (const item of conferencia.itens) {
    if (item.veredicto === "divergente") {
      paraConfirmar.push(
        `${item.rotulo}: impresso ${item.valor.toFixed(2)}, mas ${item.quantidade} × ${item.tarifa} dá ${item.esperado?.toFixed(2)}`,
      );
      continue;
    }

    const { rotulo, quantidade, tarifa, valor } = item;

    if (CONSUMO_PONTA.test(rotulo) && quantidade !== null) {
      invoice.consumoPontaKwh = soma(invoice.consumoPontaKwh, quantidade);
      invoice.tarifaPonta = tarifa ?? invoice.tarifaPonta;
      invoice.valorPonta = soma(invoice.valorPonta, valor);
    } else if (CONSUMO_FORA_PONTA.test(rotulo) && quantidade !== null) {
      invoice.consumoForaPontaKwh = soma(invoice.consumoForaPontaKwh, quantidade);
      invoice.tarifaForaPonta = tarifa ?? invoice.tarifaForaPonta;
      invoice.valorForaPonta = soma(invoice.valorForaPonta, valor);
    } else if (DEMANDA_PONTA.test(rotulo) && quantidade !== null) {
      // A maior medição da competência é a que interessa: demanda é cobrada
      // pelo pico, não pela soma das linhas.
      invoice.demandaMedidaPontaKw = Math.max(invoice.demandaMedidaPontaKw ?? 0, quantidade);
      invoice.tarifaDemanda = tarifa ?? invoice.tarifaDemanda;
      invoice.valorDemanda = soma(invoice.valorDemanda, valor);
    } else if (DEMANDA_FORA_PONTA.test(rotulo) && quantidade !== null) {
      invoice.demandaMedidaForaPontaKw = Math.max(invoice.demandaMedidaForaPontaKw ?? 0, quantidade);
      invoice.tarifaDemanda = tarifa ?? invoice.tarifaDemanda;
      invoice.valorDemanda = soma(invoice.valorDemanda, valor);
    } else if (DEMANDA_SIMPLES.test(rotulo) && quantidade !== null) {
      // Horossazonal verde tem demanda única, sem separar ponta.
      invoice.demandaMedidaForaPontaKw = Math.max(invoice.demandaMedidaForaPontaKw ?? 0, quantidade);
      invoice.tarifaDemanda = tarifa ?? invoice.tarifaDemanda;
      invoice.valorDemanda = soma(invoice.valorDemanda, valor);
    } else if (REATIVO.test(rotulo)) {
      invoice.valorReativo = soma(invoice.valorReativo, valor);
    } else if (ULTRAPASSAGEM.test(rotulo)) {
      invoice.valorMultasJurosEncargos = soma(invoice.valorMultasJurosEncargos, valor);
    }
  }

  // Estes dois a fatura não publica na camada de texto: o total fechado e a
  // demanda contratada ficam na área de imagem do documento. Pedir é honesto;
  // deduzir seria inventar.
  paraConfirmar.push("valor total da fatura (não vem na camada de texto)");
  paraConfirmar.push("demanda contratada em kW (não vem na camada de texto)");

  if (!identificacao.unidadeConsumidora) paraConfirmar.push("unidade consumidora");
  if (!identificacao.competencia) paraConfirmar.push("competência");

  const essenciais =
    invoice.consumoPontaKwh !== undefined &&
    invoice.consumoForaPontaKwh !== undefined &&
    invoice.tarifaPonta !== undefined &&
    invoice.tarifaForaPonta !== undefined;

  // Fatura sem ponta nem demanda é Grupo B — baixa tensão, tarifa única. Não é
  // falha de leitura: o estudo de eficiência é de Grupo A, e dizer "faltaram
  // campos" mandaria a pessoa procurar defeito onde não há.
  const ehGrupoB =
    !essenciais &&
    invoice.consumoPontaKwh === undefined &&
    invoice.demandaMedidaPontaKw === undefined &&
    invoice.demandaMedidaForaPontaKw === undefined &&
    itens.some((item) => /^consumo\b/i.test(item.rotulo));

  const motivo: MotivoDeRecusa | null = essenciais
    ? null
    : ehGrupoB
      ? "grupo_b"
      : "campos_essenciais_ausentes";

  if (ehGrupoB) {
    paraConfirmar.unshift("fatura do Grupo B (baixa tensão): o estudo de eficiência é para Grupo A");
  }

  return {
    origem: texto.origem,
    aproveitavel: essenciais,
    motivo,
    identificacao,
    itens,
    conferencia,
    invoice,
    camposParaConfirmar: paraConfirmar,
  };
}
