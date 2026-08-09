import type { InvoiceData } from "@plugga/shared";

import { lerCamposExtras } from "./campos.js";
import { conferir, type Conferencia } from "./conferencia.js";
import { normalizar, type OrigemDoTexto } from "./documento.js";
import { identificar, type IdentificacaoDaFatura } from "./identificacao.js";
import { lerItens, type ItemDaFatura } from "./itens.js";
import { linhasImpressas } from "./linhas.js";
import { SenhaIncorretaError, SenhaNecessariaError } from "./paginas.js";
import { lerPorVisao } from "./visao.js";

/**
 * Leitura de uma fatura da distribuidora, venha ela como for.
 *
 * A promessa deste módulo continua a mesma: **nunca devolver um número errado
 * em silêncio**. Todo campo sai de um item cuja multiplicação fechou, ou sai
 * marcado para conferência humana. O que mudou foi o alcance e a honestidade.
 *
 * Antes só havia um caminho — PDF com camada de texto legível pelo extrator
 * artesanal — e todo o resto virava a mesma frase: "a fatura é uma imagem
 * digitalizada". Foto de conta, PDF cifrado e layout novo recebiam o mesmo
 * diagnóstico e a mesma receita, que era digitar tudo à mão. Agora o formato do
 * arquivo decide o caminho, a digitalização tem OCR, o PDF com senha pede a
 * senha, e o que sobra é dito pelo nome.
 *
 * A conferência aritmética ganhou importância em vez de perder: ela foi escrita
 * para pegar erro de digitação e é exatamente a rede certa para o OCR, que erra
 * em dígito. Na amostra desta base ele leu `1,730090` como `1,7830090` — a
 * multiplicação não fecha, o item cai fora da ficha e aparece para conferir.
 */

export type MotivoDeRecusa =
  | "protegido_por_senha"
  | "senha_incorreta"
  | "sem_texto"
  | "layout_desconhecido"
  | "grupo_b"
  | "campos_essenciais_ausentes";

export type LeituraDaFatura = {
  origem: OrigemDoTexto;
  /** Falso quando não deu para montar a ficha; `motivo` diz por quê. */
  aproveitavel: boolean;
  motivo: MotivoDeRecusa | null;
  /** Confiança média do OCR, de 0 a 100; nula quando o texto veio do PDF. */
  confianca: number | null;
  identificacao: IdentificacaoDaFatura;
  itens: ItemDaFatura[];
  conferencia: Conferencia;
  /**
   * Ficha montada com o que foi confirmado. Os campos que a fatura não publica
   * ficam nulos de propósito — ver `camposParaConfirmar`.
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

const CONFERENCIA_VAZIA: Conferencia = {
  itens: [],
  confirmados: 0,
  divergentes: 0,
  semConferencia: 0,
  temDivergencia: false,
};

const SEM_IDENTIFICACAO: IdentificacaoDaFatura = {
  unidadeConsumidora: null,
  competencia: null,
  distribuidora: null,
};

function recusar(
  motivo: MotivoDeRecusa,
  explicacao: string,
  origem: OrigemDoTexto = "texto_direto",
): LeituraDaFatura {
  return {
    origem,
    aproveitavel: false,
    motivo,
    confianca: null,
    identificacao: SEM_IDENTIFICACAO,
    itens: [],
    conferencia: CONFERENCIA_VAZIA,
    invoice: {},
    camposParaConfirmar: [explicacao],
  };
}

/**
 * Monta a ficha a partir de identificação e itens, venham de onde vierem.
 *
 * Separado de `lerFatura` porque agora há duas procedências — as regras e o
 * modelo de visão — e ambas têm de passar pelo mesmo julgamento. A conferência
 * aritmética, o corte de item divergente, a regra do Grupo B e a lista do que
 * falta confirmar acontecem aqui, uma vez, para as duas.
 */
function montarFicha(
  identificacao: IdentificacaoDaFatura,
  itens: ItemDaFatura[],
  extras: ReturnType<typeof lerCamposExtras>,
  origem: OrigemDoTexto,
  confianca: number | null,
): LeituraDaFatura {
  const conferencia = conferir(itens);

  if (itens.length === 0) {
    return {
      ...recusar(
        "layout_desconhecido",
        "layout não reconhecido: nenhum item financeiro identificado",
        origem,
      ),
      confianca,
      identificacao,
    };
  }

  return montarComItens(identificacao, itens, conferencia, extras, origem, confianca);
}

export async function lerFatura(
  conteudo: Buffer,
  senha?: string,
  mime = "application/pdf",
): Promise<LeituraDaFatura> {
  let documento;
  try {
    documento = await normalizar(conteudo, senha);
  } catch (erro) {
    // Senha não é falha: é uma pergunta que o sistema tem de fazer. Vira
    // resultado, não exceção, para a tela poder pedi-la sem perder o arquivo.
    if (erro instanceof SenhaNecessariaError) {
      return recusar("protegido_por_senha", "este PDF está protegido por senha");
    }
    if (erro instanceof SenhaIncorretaError) {
      return recusar("senha_incorreta", "a senha informada não abre este PDF");
    }
    throw erro;
  }

  // A leitura por linha impressa é a principal: é ela que junta rótulo, tarifa
  // e valor que a fatura imprime na mesma altura da folha. Medida nas 58
  // faturas legíveis desta base, ela confirma pela aritmética exatamente os
  // mesmos 204 itens que a leitura pela ordem do fluxo, com um terço dos itens
  // espúrios — e é a única que funciona para o texto vindo de OCR, onde não
  // existe "ordem do fluxo".
  const linhas = linhasImpressas(documento.paginas);
  const confianca = documento.confianca;

  if (linhas.length === 0) {
    return recusar(
      "sem_texto",
      documento.origem === "reconhecimento_optico"
        ? "não foi possível reconhecer texto nesta imagem: tente uma foto mais nítida ou mais próxima"
        : "o arquivo não tem texto legível",
      documento.origem,
    );
  }

  const extras = lerCamposExtras(documento.paginas);
  const porRegras = montarFicha(
    identificar(linhas),
    lerItens(linhas),
    extras,
    documento.origem,
    confianca,
  );

  // Regra que fechou a ficha é a resposta: é gratuita, determinística e diz de
  // que posição da folha saiu cada número. O modelo é o plano B, não o padrão.
  if (porRegras.aproveitavel) return porRegras;

  const visao = await lerPorVisao(conteudo, mime);
  if (!visao) return porRegras;

  const porVisao = montarFicha(
    {
      // Identificação lida por regra tem precedência: veio de um padrão
      // verificável. O modelo só preenche o que ficou nulo — foi assim que a
      // Roraima Energia entrou, com o "Código Único" que nenhum padrão pegava.
      unidadeConsumidora:
        porRegras.identificacao.unidadeConsumidora ?? visao.identificacao.unidadeConsumidora,
      competencia: porRegras.identificacao.competencia ?? visao.identificacao.competencia,
      distribuidora: porRegras.identificacao.distribuidora ?? visao.identificacao.distribuidora,
    },
    visao.itens,
    extras,
    documento.origem,
    confianca,
  );

  // Só troca se o modelo fechou o que a regra não fechou. Empate fica com a
  // regra: entre dois resultados equivalentes, o rastreável é melhor.
  return porVisao.aproveitavel ? porVisao : porRegras;
}

function montarComItens(
  identificacao: IdentificacaoDaFatura,
  itens: ItemDaFatura[],
  conferencia: Conferencia,
  extras: ReturnType<typeof lerCamposExtras>,
  origem: OrigemDoTexto,
  confianca: number | null,
): LeituraDaFatura {
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

  // Os dois campos que a leitura antiga declarava ausentes da camada de texto e
  // mandava digitar. Estão lá; faltava ler a folha por posição. Continuam indo
  // para conferência quando de fato não aparecem.
  if (extras.valorTotal !== null && extras.valorTotal > 0) invoice.valorTotal = extras.valorTotal;
  else paraConfirmar.push("valor total da fatura");

  const contratada =
    extras.demandaContratadaPontaKw ??
    extras.demandaContratadaKw ??
    extras.demandaContratadaForaPontaKw;

  if (contratada !== null && contratada > 0) invoice.demandaContratadaKw = contratada;
  else paraConfirmar.push("demanda contratada em kW");

  // Demanda contratada diferente entre ponta e fora ponta é tarifa azul, e a
  // ficha só guarda um valor. Dizer qual foi usado evita um estudo dimensionado
  // pelo número errado sem ninguém perceber.
  if (
    extras.demandaContratadaPontaKw !== null &&
    extras.demandaContratadaForaPontaKw !== null &&
    extras.demandaContratadaPontaKw !== extras.demandaContratadaForaPontaKw
  ) {
    paraConfirmar.push(
      `a fatura tem demanda contratada diferente em ponta (${extras.demandaContratadaPontaKw} kW) ` +
        `e fora ponta (${extras.demandaContratadaForaPontaKw} kW); a ficha usou a de ponta`,
    );
  }

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
    origem,
    aproveitavel: essenciais,
    motivo,
    confianca,
    identificacao,
    itens,
    conferencia,
    invoice,
    camposParaConfirmar: paraConfirmar,
  };
}
