import type { Fragmento, PaginaDoDocumento } from "./paginas.js";

/**
 * Leitura óptica de fatura digitalizada.
 *
 * É o que faltava para a funcionalidade servir ao corpus real: pela medição das
 * 73 faturas do CRM, três quartos são digitalização. Sem OCR, o sistema estava
 * certo em dizer "não dá para ler" — e inútil para a maioria dos casos.
 *
 * A saída sai no **mesmo formato das páginas do PDF**: pedaços de texto com
 * coordenada. Isso não é detalhe de implementação, é a decisão que mantém o
 * resto do módulo pequeno — `linhas.ts`, `campos.ts`, `itens.ts` e
 * `identificacao.ts` não sabem se o texto veio da camada do PDF ou de uma foto,
 * e não precisam saber.
 *
 * O OCR erra, e erra em número. Na amostra desta base ele leu a tarifa
 * `1,730090` como `1,7830090` — um dígito a mais que passa despercebido a olho
 * e muda o estudo. Quem pega isso é a conferência aritmética que já existe:
 * `quantidade × tarifa = valor` não fecha, o item é marcado divergente e não
 * entra na ficha. A rede de segurança foi construída antes do OCR existir e é
 * exatamente a certa para ele.
 */

/**
 * Confiança mínima, de 0 a 100, para a palavra entrar no texto.
 *
 * Abaixo disso o Tesseract costuma estar lendo ruído de digitalização como
 * letra. Descartar é melhor que passar adiante: palavra errada vira rótulo
 * errado, e rótulo errado casa com o campo errado da ficha.
 */
const CONFIANCA_MINIMA = 40;

/** Idioma dos dados de treino. Fatura brasileira, sempre. */
const IDIOMA = "por";

/**
 * Modo de segmentação: uma coluna de texto com tamanhos variados.
 *
 * Medido, não escolhido por gosto. No modo automático — o padrão — o Tesseract
 * decide que a fatura é um bloco de prosa e **descarta as colunas numéricas**:
 * na página de teste ele não devolveu nenhum dos valores da tabela de itens,
 * nem `1,730090`, nem `145,32`, nem `760,24`. O rótulo vinha, o número não, e o
 * leitor de itens não achava item nenhum numa página que parecia bem lida.
 *
 * Com este modo os mesmos valores voltam com 89% a 96% de confiança, e a
 * confiança média da página sobe de 85 para 90. Faz sentido: uma conta de luz é
 * uma tabela, não um texto corrido, e é a análise de layout automática que
 * atrapalha.
 */
const SEGMENTACAO_EM_COLUNA = "4";

type PalavraDoTesseract = {
  text?: string;
  confidence?: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
};

type ResultadoDoTesseract = {
  data: {
    confidence?: number;
    blocks?: { paragraphs?: { lines?: { words?: PalavraDoTesseract[] }[] }[] }[];
  };
};

type TrabalhadorDoTesseract = {
  setParameters(parametros: Record<string, string>): Promise<unknown>;
  recognize(
    imagem: Buffer,
    opcoes: Record<string, unknown>,
    saida: Record<string, boolean>,
  ): Promise<ResultadoDoTesseract>;
  terminate(): Promise<void>;
};

export type PaginaReconhecida = {
  pagina: PaginaDoDocumento;
  /** Confiança média do Tesseract na página, de 0 a 100. */
  confianca: number;
};

/**
 * Onde ficam os dados de treino.
 *
 * Por padrão o tesseract.js baixa `por.traineddata` de um CDN na primeira
 * leitura. Em produção isso é uma dependência de rede escondida dentro do que
 * deveria ser uma conta local: sem internet, a primeira fatura digitalizada
 * falha com erro de download. A imagem traz o arquivo e aponta para cá.
 */
function caminhoDosDados(): string | undefined {
  return process.env.TESSERACT_DATA_PATH || undefined;
}

/**
 * Um reconhecimento por vez.
 *
 * Cada trabalhador do Tesseract carrega ~50 MB de WASM e dados de treino, e o
 * reconhecimento é preso em CPU. Deixar dez faturas rodando em paralelo numa
 * VPS pequena não vai dez vezes mais rápido — vai derrubar a API por memória.
 * É a mesma escolha feita em `documento/pdf.ts`, pelo mesmo motivo.
 */
let fila: Promise<unknown> = Promise.resolve();
let esperando = 0;

/** Teto da fila: quem chega depois disso espera minutos, e é melhor dizer não. */
const ESPERA_MAXIMA = 6;

export class OcrOcupadoError extends Error {
  constructor() {
    super("há leituras de fatura digitalizada demais na fila; tente de novo em instantes");
    this.name = "OcrOcupadoError";
  }
}

function enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
  if (esperando >= ESPERA_MAXIMA) return Promise.reject(new OcrOcupadoError());

  esperando += 1;
  const proxima = fila.then(tarefa).finally(() => {
    esperando -= 1;
  });
  // A fila nunca rejeita: uma leitura que falha não pode travar as próximas.
  fila = proxima.catch(() => undefined);
  return proxima;
}

/**
 * Converte a palavra do Tesseract em pedaço de página.
 *
 * A imagem tem origem no canto superior esquerdo e `y` cresce para baixo; o PDF
 * tem origem embaixo e `y` cresce para cima. Inverter o sinal é o que permite
 * `montarLinhas` tratar os dois sem saber a diferença.
 *
 * Basta negar, sem subtrair da altura da imagem: as duas formas diferem por uma
 * constante, e tudo o que se faz com `y` adiante é comparar valores entre si —
 * ordenar de cima para baixo e agrupar o que está na mesma altura. Não precisar
 * da altura é o que dispensa medir a imagem antes, e medir a imagem era o que
 * exigia entregá-la a um decodificador nativo.
 */
function comoFragmento(palavra: PalavraDoTesseract): Fragmento[] {
  const texto = (palavra.text ?? "").trim();
  const caixa = palavra.bbox;

  if (!texto || !caixa) return [];
  if ((palavra.confidence ?? 0) < CONFIANCA_MINIMA) return [];

  return [
    {
      texto,
      x: caixa.x0,
      y: -caixa.y1,
      largura: caixa.x1 - caixa.x0,
      altura: caixa.y1 - caixa.y0,
    },
  ];
}

/**
 * O arquivo tem assinatura de imagem, mas o decodificador não o abre.
 *
 * Vem do Tesseract, que é WebAssembly: uma imagem truncada faz a leitura falhar
 * com erro, e não derrubar o processo. É o motivo de a decodificação ficar toda
 * aqui — a versão que media a imagem com o decodificador nativo do canvas
 * morria de verdade, com sinal 11, ao receber um JPEG cortado. Um arquivo
 * enviado por terceiro não pode ter esse poder.
 */
export class ImagemIndecifravelError extends Error {
  constructor(causa: unknown) {
    super("o arquivo parece uma imagem, mas está corrompido ou truncado", { cause: causa });
    this.name = "ImagemIndecifravelError";
  }
}

/**
 * Lê uma imagem e devolve a página no formato do resto do módulo.
 *
 * As medidas da página saem da extensão das próprias palavras reconhecidas.
 * Nada adiante usa a medida em si — só a posição relativa entre os pedaços —,
 * então derivar do que foi lido evita ter de abrir a imagem só para perguntar
 * seu tamanho.
 */
export async function reconhecer(
  imagem: Buffer,
  numeroDaPagina: number,
): Promise<PaginaReconhecida> {
  return enfileirar(async () => {
    const { createWorker } = await import("tesseract.js");

    // `langPath` só entra quando há caminho: a chave presente com `undefined`
    // não faz o tesseract.js cair no padrão dele, sobrescreve com nada.
    const trabalhador = (await createWorker(IDIOMA, undefined, {
      ...(caminhoDosDados() ? { langPath: caminhoDosDados() } : {}),
      // Obrigatório, e não é preciosismo. Sem um `errorHandler` o tesseract.js
      // faz `throw` de dentro do ouvinte de mensagens do worker — fora de
      // qualquer promessa, portanto fora de qualquer `try`. Uma imagem
      // corrompida enviada por terceiro viraria exceção não tratada e
      // derrubaria o processo da API. A promessa de `recognize` já é rejeitada
      // com o mesmo erro logo antes, então engolir aqui não perde informação:
      // quem trata é o `catch` abaixo.
      errorHandler: () => undefined,
    })) as unknown as TrabalhadorDoTesseract;

    try {
      await trabalhador.setParameters({ tessedit_pageseg_mode: SEGMENTACAO_EM_COLUNA });

      let data;
      try {
        ({ data } = await trabalhador.recognize(imagem, {}, { blocks: true, text: false }));
      } catch (erro) {
        throw new ImagemIndecifravelError(erro);
      }

      const palavras = (data.blocks ?? []).flatMap((bloco) =>
        (bloco.paragraphs ?? []).flatMap((paragrafo) =>
          (paragrafo.lines ?? []).flatMap((linha) => linha.words ?? []),
        ),
      );

      const fragmentos = palavras.flatMap(comoFragmento);
      const direitas = fragmentos.map((f) => f.x + f.largura);
      const topos = fragmentos.map((f) => f.y + f.altura);

      return {
        pagina: {
          numero: numeroDaPagina,
          largura: direitas.length ? Math.max(...direitas) : 0,
          altura: topos.length ? Math.max(...topos) - Math.min(...fragmentos.map((f) => f.y)) : 0,
          fragmentos,
        },
        confianca: data.confidence ?? 0,
      };
    } finally {
      // Sempre encerrado: cada trabalhador segura dezenas de megabytes, e um
      // vazamento por leitura derruba a API em poucas dezenas de faturas.
      await trabalhador.terminate();
    }
  });
}

