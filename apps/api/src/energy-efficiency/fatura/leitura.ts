import type { InvoiceData } from "@plugga/shared";

import { somarComoOOraculo } from "../nucleo/aritmetica.js";
import { TOLERANCIA_DO_TOTAL } from "../nucleo/conciliacao.js";
import { lerCamposExtras } from "./campos.js";
import { conferir, type Conferencia } from "./conferencia.js";
import { normalizar, type DocumentoNormalizado, type OrigemDoTexto } from "./documento.js";
import { identificar, type IdentificacaoDaFatura } from "./identificacao.js";
import { marcarInformativos, type ItemDaLeitura } from "./informativos.js";
import { lerItens, type ItemDaFatura } from "./itens.js";
import { linhasImpressas, linhasPorColuna } from "./linhas.js";
import { abrirPdf, SenhaIncorretaError, SenhaNecessariaError } from "./paginas.js";
import type { LeitorPorVisao, PaginaParaVisao } from "./visao.js";

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
  itens: ItemDaLeitura[];
  /**
   * Valor da linha de demanda sem ICMS, quando a fatura a publica. Nulo quando
   * não existe — e aí quem calcula usa rateio, nunca o contrário.
   */
  demandaComplementoValor: number | null;
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
/**
 * Demanda complementar: a parcela cobrada sem ICMS, que a fatura imprime em
 * linha própria ao lado da parcela com ICMS.
 *
 * É o valor que a norma usa como economia de readequação contratual. Quando a
 * linha existe, o número é lido dela; o rateio só entra quando ela não existe, e
 * nunca por cima do que a fatura publicou.
 */
const DEMANDA_COMPLEMENTO = /^demanda\b.*\b(sem\s*icms|complement)/i;
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
    demandaComplementoValor: null,
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

/**
 * Entre duas leituras da mesma fatura, fica a que a aritmética aprova.
 *
 * Ordem de preferência: ficha aproveitável ganha de ficha recusada; entre duas
 * aproveitáveis, ganha a que conferiu mais itens pela multiplicação. Empate
 * mantém a primeira, que é a leitura principal.
 */
function melhorLeitura(candidatas: readonly LeituraDaFatura[]): LeituraDaFatura {
  const nota = (leitura: LeituraDaFatura): number =>
    (leitura.aproveitavel ? 1_000 : 0) + leitura.conferencia.confirmados * 10 -
    leitura.conferencia.divergentes;

  return candidatas.reduce((melhor, atual) =>
    nota(atual) > nota(melhor) ? atual : melhor,
  );
}

/**
 * A soma dos itens que compõem o total, do jeito que a Trava 1 a calcula.
 *
 * Dois cuidados, e os dois são a diferença entre reusar a regra e reinventá-la:
 *
 * - **só entra quem tem `compoeTotal`.** A bandeira que a própria aritmética
 *   provou informativa (`informativos.ts`) fica fora, senão toda fatura que
 *   imprime bandeira sem cobrá-la reprovaria — a Santa Tereza inclusive;
 * - **soma como o oráculo.** Somar da esquerda para a direita diverge no último
 *   dígito em 5 das 27 faturas do corpus normativo, e uma soma que decide
 *   escalonamento não pode diferir da soma que decide a conciliação.
 */
export function somaDoQueCompoeOTotal(itens: readonly ItemDaLeitura[]): number {
  return somarComoOOraculo(
    itens.filter((item) => item.compoeTotal).map((item) => item.valor),
  );
}

/**
 * A Trava 1 aplicada ao que a leitura montou: soma dos itens = total impresso.
 *
 * A constante da folga vem de `nucleo/conciliacao.ts` de propósito. Duas
 * tolerâncias que deveriam ser a mesma divergem em silêncio, e o dia em que
 * alguém afrouxar a conciliação sem afrouxar o portão é o dia em que a leitura
 * passa a escalar fatura que o núcleo aceitaria.
 *
 * **Sem total conhecido devolve `true`**, e isso é deliberado. Nem toda fatura
 * publica o total num formato que as regras achem; sem ele não há o que provar,
 * e exigir a prova reprovaria a leitura por falta de evidência, não por erro.
 * A ausência aparece onde tem de aparecer: `valorTotal` já entra em
 * `camposParaConfirmar` nesse caso.
 *
 * Não é `conciliarFatura`. Aquela função exige uma `FaturaNormativa` completa —
 * cliente, regime, modalidade, vencimento — e aqui só existe uma ficha parcial.
 * O que se reusa é a constante e a regra, não a função.
 */
export function somaFechaComOTotal(leitura: LeituraDaFatura): boolean {
  const total = leitura.invoice.valorTotal;
  if (total === undefined) return true;

  return Math.abs(somaDoQueCompoeOTotal(leitura.itens) - total) <= TOLERANCIA_DO_TOTAL;
}

/**
 * O portão do escalonamento: a leitura já está provada, ou vale gastar a visão?
 *
 * Era `aproveitavel` sozinho, que significa **os itens fecharem individualmente**
 * (`quantidade × tarifa = valor`). Essa prova é fraca exatamente onde mais dói:
 * uma leitura que **perde um item inteiro** passa por ela, porque os itens que
 * sobraram fecham entre si. A visão nunca era chamada e o erro só aparecia lá na
 * frente, na conciliação, com o estudo já sendo montado.
 *
 * A prova de verdade é a soma contra o total impresso, e ela passa a valer aqui,
 * antes de a ficha sair. É mais rigoroso e faz mais leitura escalar para a
 * visão — decisão de custo já tomada no plano: visão é barata, ler errado em
 * silêncio não é.
 */
export function leituraProvada(leitura: LeituraDaFatura): boolean {
  return leitura.aproveitavel && somaFechaComOTotal(leitura);
}

export type OpcoesDeLeitura = {
  senha?: string;
  /** Tipo do arquivo enviado; decide se a visão recebe a imagem ou a página rasterizada. */
  mime?: string;
  /**
   * Leitor por modelo, injetado por quem tem o gateway. Ausente, a leitura fica
   * só nas regras — que é o comportamento correto sem chave configurada.
   */
  visao?: LeitorPorVisao;
  /** Impressão digital do arquivo, para o consumo poder ser dividido por fatura. */
  referencia?: string;
};

/** Quantas páginas vão para o modelo. Fatura de energia cabe folgado em três. */
const PAGINAS_PARA_VISAO = 3;

/**
 * A parte síncrona e determinística da leitura: da página normalizada até a
 * ficha que as regras conseguem montar sozinhas, sem modelo.
 *
 * Fica exportada porque é o núcleo testável sem PDF nem rede — quem quer
 * provar um layout novo congela a página normalizada e chama esta função
 * direto. É assim que `sintetica.spec.ts` roda sem credencial nenhuma e que
 * `roraima.corpus.spec.ts` roda contra a fixture baixada do balde.
 */
export function lerPorRegras(documento: DocumentoNormalizado): LeituraDaFatura {
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

  // Duas leituras da mesma folha, e a aritmética decide qual valeu.
  //
  // A linha impressa de largura inteira é a leitura principal e continua sendo
  // a primeira tentativa. Ela falha em fatura de duas colunas, onde blocos que
  // nada têm a ver ficam impressos na mesma altura: na Roraima Energia, a linha
  // do consumo de ponta sai grudada no cabeçalho da unidade, e nenhum item é
  // reconhecido.
  //
  // A leitura por coluna corta nas divisas de branco da própria página. Ela não
  // substitui a outra — quem lê demanda contratada precisa do rótulo de uma
  // coluna com o valor de outra —, então as duas rodam e fica a que fecha a
  // conta. Escolher pela soma dos itens é o critério honesto: não é preferência
  // por layout, é a fatura provando qual leitura a entendeu.
  // A identificação lê as duas visões da folha: o rótulo da unidade pode estar
  // numa coluna e o código na linha de baixo da mesma coluna, o que só aparece
  // depois do corte.
  const porColuna = linhasPorColuna(documento.paginas);
  const identificacao = identificar([...linhas, ...porColuna]);

  return melhorLeitura([
    montarFicha(identificacao, lerItens(linhas), extras, documento.origem, confianca),
    montarFicha(identificacao, lerItens(porColuna), extras, documento.origem, confianca),
  ]);
}

export async function lerFatura(
  conteudo: Buffer,
  opcoes: OpcoesDeLeitura = {},
): Promise<LeituraDaFatura> {
  const { senha, mime = "application/pdf", visao: lerPorVisao, referencia } = opcoes;
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

  if (!lerPorVisao) return lerPorRegras(documento);

  // O modelo recebe imagem, não PDF: rasterizar aqui reaproveita o caminho que
  // o OCR já usa e vale para qualquer modelo, em vez de depender de o provedor
  // saber abrir PDF. Arquivo que já é imagem vai como está.
  // O PDF é reaberto porque `normalizar` devolve só o texto já extraído, sem o
  // rasterizador. Abrir duas vezes custa, mas acontece só no plano B — quando o
  // portão não aprovou a leitura por regras — e não no caminho que atende a
  // maioria. Por isso isto é uma função e não um valor: quem não escala não
  // rasteriza.
  const paginasParaVisao = async (): Promise<PaginaParaVisao[]> => {
    if (mime !== "application/pdf") return [{ conteudo, mime }];

    const aberto = await abrirPdf(conteudo, senha);
    try {
      return await Promise.all(
        aberto.paginas.slice(0, PAGINAS_PARA_VISAO).map(async (_, indice) => ({
          conteudo: await aberto.rasterizar(indice + 1),
          mime: "image/png",
        })),
      );
    } finally {
      await aberto.fechar();
    }
  };

  return lerComVisao(documento, lerPorVisao, paginasParaVisao, referencia);
}

/**
 * Regras primeiro, visão como plano B — a partir da página já normalizada.
 *
 * Separada de `lerFatura` pela mesma razão de `lerPorRegras`: é aqui que mora a
 * decisão que este módulo precisa provar — quando escalar, e com qual das duas
 * leituras ficar — e essa decisão tem de ser exercitável sem PDF, sem rede e
 * sem credencial. `lerFatura` fica com o que só um arquivo de verdade dá: abrir
 * o PDF, pedir a senha, rasterizar a folha.
 *
 * As páginas para o modelo chegam como função, não como valor: quando o portão
 * aprova a leitura por regras, nada é rasterizado e nada é enviado.
 */
export async function lerComVisao(
  documento: DocumentoNormalizado,
  lerPorVisao: LeitorPorVisao,
  paginasParaVisao: () => Promise<PaginaParaVisao[]>,
  referencia?: string,
): Promise<LeituraDaFatura> {
  const confianca = documento.confianca;
  const extras = lerCamposExtras(documento.paginas);
  const porRegras = lerPorRegras(documento);

  // Regra que fechou a ficha **e a soma** é a resposta: é gratuita,
  // determinística e diz de que posição da folha saiu cada número. O modelo é o
  // plano B, não o padrão. O que mudou é o que conta como "fechou": ver
  // `leituraProvada`.
  if (leituraProvada(porRegras)) return porRegras;

  const visao = await lerPorVisao(await paginasParaVisao(), referencia);
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

  // Só troca se o modelo fechou o que a regra não fechou — e "fechou" aqui é o
  // mesmo portão, soma contra total. Empate fica com a regra: entre dois
  // resultados equivalentes, o rastreável é melhor.
  if (leituraProvada(porVisao)) return porVisao;

  // Nenhuma das duas provou a soma. A regra fica, porque veio de posição na
  // folha e não de modelo — a menos que ela nem ficha tenha montado, que é o
  // caso em que a visão já era a única chance. Este ramo é o comportamento
  // antigo, intacto: com o portão velho só se chegava aqui com a regra
  // recusada.
  if (porRegras.aproveitavel) return porRegras;

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

  // A composição do total nasce da aritmética: item de bandeira que faz a soma
  // passar do total é marcado como informativo, com o motivo registrado.
  const itensDaLeitura = marcarInformativos(conferencia.itens, invoice.valorTotal);

  // E a Trava 1 é dita na hora, não só usada como portão.
  //
  // O portão manda a leitura para a visão; esta linha existe para o caso em que
  // não há visão configurada — sem chave, o plano B não roda e a ficha sai
  // assim mesmo. Sair com a soma aberta é aceitável; sair sem dizer que ela
  // está aberta seria devolver número errado em silêncio, que é justamente o
  // que este módulo promete não fazer.
  if (invoice.valorTotal !== undefined) {
    const somaDosItens = somaDoQueCompoeOTotal(itensDaLeitura);
    const diferenca = somaDosItens - invoice.valorTotal;

    if (Math.abs(diferenca) > TOLERANCIA_DO_TOTAL) {
      paraConfirmar.push(
        `a soma dos itens (R$ ${somaDosItens.toFixed(2)}) não fecha com o total impresso ` +
          `(R$ ${invoice.valorTotal.toFixed(2)}): diferença de R$ ${diferenca.toFixed(2)}. ` +
          "Costuma ser item que a leitura perdeu — corrija a extração, nunca ajuste o total.",
      );
    }
  }

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
    itens: itensDaLeitura,
    conferencia,
    // A linha explícita manda: quem calcula economia de readequação usa este
    // número quando ele existe, e só cai no rateio quando não existe.
    demandaComplementoValor:
      itens.find((item) => DEMANDA_COMPLEMENTO.test(item.rotulo))?.valor ?? null,
    invoice,
    camposParaConfirmar: paraConfirmar,
  };
}
