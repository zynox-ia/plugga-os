import { createRequire } from "node:module";

/**
 * Páginas de um documento, com o texto onde ele está de fato na folha.
 *
 * Este módulo substitui o varredor de bytes que lia o PDF à mão. A diferença
 * não é de estilo: o varredor procurava a palavra `stream`, inflava o que vinha
 * depois e torcia para ser texto. Isso ignora a tabela de referências cruzadas,
 * os *object streams*, a criptografia e o mapa `/ToUnicode` da fonte — quatro
 * coisas que um PDF de verdade usa. Quando qualquer uma aparecia, o resultado
 * era zero texto, e a leitura concluía "é uma imagem digitalizada".
 *
 * Duas das sessenta faturas do repositório caíam nesse buraco: não são imagem,
 * são **PDF protegido por senha**. Dizer "digitalize à mão" para quem só
 * precisava informar a senha é o pior tipo de erro — o sistema manda a pessoa
 * trabalhar em vez de fazer uma pergunta.
 *
 * O outro ganho é a coordenada. O varredor devolvia literais soltos, na ordem
 * em que apareciam no fluxo de conteúdo, e a associação entre coluna e valor se
 * perdia. Com `x` e `y` de cada pedaço dá para remontar a linha impressa — é o
 * que recupera a demanda contratada, que a fatura publica e o sistema pedia
 * para digitar todo mês.
 */

/**
 * Pedaço de texto com a posição em que foi impresso.
 *
 * `y` cresce para cima, como no PDF — a folha começa em zero embaixo. Quem
 * ordena para leitura precisa inverter, e é o que `linhas.ts` faz.
 */
export type Fragmento = {
  texto: string;
  x: number;
  y: number;
  largura: number;
  /** Altura da fonte, usada para decidir o que é a mesma linha impressa. */
  altura: number;
};

export type PaginaDoDocumento = {
  numero: number;
  largura: number;
  altura: number;
  fragmentos: Fragmento[];
};

export type DocumentoAberto = {
  paginas: PaginaDoDocumento[];
  /** Quantidade de caracteres na camada de texto, somando as páginas. */
  caracteres: number;
  /** Rasteriza uma página para OCR. Só é chamado quando não há texto. */
  rasterizar(numero: number): Promise<Buffer>;
  fechar(): Promise<void>;
};

/** O PDF exige senha e nenhuma foi informada. */
export class SenhaNecessariaError extends Error {
  constructor() {
    super("este PDF está protegido por senha");
    this.name = "SenhaNecessariaError";
  }
}

/** A senha informada não abre o documento. */
export class SenhaIncorretaError extends Error {
  constructor() {
    super("a senha informada não abre este PDF");
    this.name = "SenhaIncorretaError";
  }
}

/** O arquivo começa com `%PDF-` mas não é um PDF que dê para abrir. */
export class PdfIlegivelError extends Error {
  constructor(causa: unknown) {
    super("o arquivo diz ser PDF, mas está corrompido ou truncado", { cause: causa });
    this.name = "PdfIlegivelError";
  }
}

/**
 * Resolução da rasterização, em pontos por polegada.
 *
 * O Tesseract foi treinado em 300 dpi e degrada visivelmente abaixo de 150. Em
 * 200 uma folha A4 vira uma imagem de ~1650×2340, que o OCR lê em poucos
 * segundos; em 300 a imagem dobra de área e o ganho de acerto não paga o tempo
 * numa VPS pequena.
 */
const DPI = 200;
const PONTOS_POR_POLEGADA = 72;

const exigir = createRequire(__filename);

type ApiDoPdfjs = {
  getDocument(opcoes: Record<string, unknown>): { promise: Promise<DocumentoDoPdfjs> };
};

type DocumentoDoPdfjs = {
  numPages: number;
  getPage(numero: number): Promise<PaginaDoPdfjs>;
  destroy(): Promise<void>;
};

type PaginaDoPdfjs = {
  getViewport(opcoes: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: ItemDeTexto[] }>;
  render(opcoes: Record<string, unknown>): { promise: Promise<void> };
  cleanup(): void;
};

type ItemDeTexto = {
  str?: string;
  width?: number;
  height?: number;
  transform?: number[];
};

let pdfjsCarregado: ApiDoPdfjs | null = null;

/**
 * Carrega o pdf.js, que só é distribuído como ESM.
 *
 * A API compila para CommonJS, o que historicamente seria um problema: um
 * `require` de pacote ESM falhava. Desde o Node 22.12 não falha mais — o
 * `require` de um módulo ESM sem `await` de topo é suportado, e o pdf.js é
 * assim. Então a ponte é o `createRequire` e nada mais.
 *
 * A tentação aqui era `await import(...)`. Não serve: no alvo CommonJS o
 * TypeScript reescreve essa expressão, e a versão que sobrevive à reescrita
 * quebra dentro do executor de testes, que avalia os módulos num contexto de VM
 * sem `import` dinâmico. O `require` explícito é o único caminho que funciona
 * igual na compilação, no teste e em produção.
 *
 * O módulo custa alguns megabytes para carregar; uma vez por processo basta.
 */
function carregarPdfjs(): ApiDoPdfjs {
  pdfjsCarregado ??= exigir("pdfjs-dist/legacy/build/pdf.mjs") as ApiDoPdfjs;
  return pdfjsCarregado;
}

/**
 * Diretório do pacote, onde ficam as fontes padrão e os CMaps.
 *
 * Sem eles o pdf.js não desenha as 14 fontes padrão do PostScript nem decodifica
 * texto CJK — a rasterização sai com buracos no lugar das letras, e o OCR então
 * lê uma folha em branco. São arquivos que já vêm no pacote; só falta apontar.
 */
function raizDoPdfjs(): string {
  return exigir.resolve("pdfjs-dist/package.json").replace(/package\.json$/, "");
}

/** O pdf.js sinaliza senha por um erro com `name` próprio e um código. */
function ehErroDeSenha(erro: unknown): number | null {
  if (typeof erro !== "object" || erro === null) return null;
  const candidato = erro as { name?: string; code?: number };
  return candidato.name === "PasswordException" ? (candidato.code ?? 1) : null;
}

/** Código 1 é "falta a senha"; 2 é "a senha está errada". */
const PRECISA_DE_SENHA = 1;

export async function abrirPdf(bytes: Buffer, senha?: string): Promise<DocumentoAberto> {
  const pdfjs = carregarPdfjs();
  const raiz = raizDoPdfjs();

  let documento: DocumentoDoPdfjs;
  try {
    documento = await pdfjs.getDocument({
      // Cópia porque o pdf.js assume posse do buffer e o esvazia ao terminar;
      // quem chamou ainda precisa dos bytes para guardar o arquivo original.
      data: new Uint8Array(bytes),
      password: senha ?? "",
      standardFontDataUrl: `${raiz}standard_fonts/`,
      cMapUrl: `${raiz}cmaps/`,
      cMapPacked: true,
      // O documento vem de fora: nada de compilar expressão nem buscar fonte no
      // sistema por conta de um arquivo enviado por terceiro.
      isEvalSupported: false,
      useSystemFonts: false,
    }).promise;
  } catch (erro) {
    const codigo = ehErroDeSenha(erro);
    if (codigo === PRECISA_DE_SENHA) throw new SenhaNecessariaError();
    if (codigo !== null) throw new SenhaIncorretaError();
    throw new PdfIlegivelError(erro);
  }

  const paginas: PaginaDoDocumento[] = [];

  for (let numero = 1; numero <= documento.numPages; numero += 1) {
    const pagina = await documento.getPage(numero);
    const medidas = pagina.getViewport({ scale: 1 });
    const conteudo = await pagina.getTextContent();

    paginas.push({
      numero,
      largura: medidas.width,
      altura: medidas.height,
      fragmentos: conteudo.items.flatMap((item) => {
        const texto = item.str ?? "";
        // A matriz de transformação traz a posição em 4 e 5; sem ela o pedaço
        // não serve para remontar linha, e é o que este módulo existe para dar.
        const matriz = item.transform;
        if (!texto.trim() || !matriz || matriz.length < 6) return [];

        return [
          {
            texto,
            x: matriz[4] ?? 0,
            y: matriz[5] ?? 0,
            largura: item.width ?? 0,
            altura: item.height ?? Math.abs(matriz[3] ?? 0),
          },
        ];
      }),
    });

    pagina.cleanup();
  }

  return {
    paginas,
    caracteres: paginas.reduce(
      (soma, pagina) => soma + pagina.fragmentos.reduce((n, f) => n + f.texto.trim().length, 0),
      0,
    ),

    async rasterizar(numero: number): Promise<Buffer> {
      // Importado aqui porque o canvas é binário nativo e só a rasterização
      // precisa dele: uma fatura com camada de texto nunca chega a carregá-lo.
      const { createCanvas } = await import("@napi-rs/canvas");
      const pagina = await documento.getPage(numero);
      const vista = pagina.getViewport({ scale: DPI / PONTOS_POR_POLEGADA });
      const tela = createCanvas(Math.ceil(vista.width), Math.ceil(vista.height));

      await pagina.render({
        canvas: tela,
        canvasContext: tela.getContext("2d"),
        viewport: vista,
        // O texto é desenhado como forma, não como fonte do sistema: garante
        // que a imagem enviada ao OCR seja a mesma em qualquer máquina.
        intent: "print",
      }).promise;

      pagina.cleanup();
      return Buffer.from(tela.toBuffer("image/png"));
    },

    fechar: () => documento.destroy(),
  };
}
