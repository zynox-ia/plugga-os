import { reconhecerFormato } from "./formato.js";
import { reconhecer } from "./ocr.js";
import { abrirPdf, type PaginaDoDocumento } from "./paginas.js";

/**
 * Qualquer arquivo vira a mesma coisa: páginas com texto posicionado.
 *
 * É a peça que faltava no desenho anterior. Antes havia um caminho só — PDF com
 * camada de texto — e todo o resto era exceção, tratada com a mesma frase
 * ("é uma imagem digitalizada") tanto para uma foto quanto para um PDF cifrado
 * quanto para um layout novo. Três problemas diferentes, três soluções
 * diferentes, uma única resposta errada.
 *
 * Aqui o formato decide o caminho, e todos os caminhos terminam no mesmo
 * formato de saída. Quem lê a fatura depois disso não sabe se o texto veio da
 * camada do PDF ou de uma foto tirada no pátio — e é justamente por não saber
 * que continua funcionando quando entra uma origem nova.
 */

export type OrigemDoTexto = "texto_direto" | "reconhecimento_optico";

export type DocumentoNormalizado = {
  origem: OrigemDoTexto;
  paginas: PaginaDoDocumento[];
  /** Confiança média do OCR, de 0 a 100; nula quando o texto veio do PDF. */
  confianca: number | null;
  /** Quantas páginas o arquivo tem, mesmo que nem todas tenham sido lidas. */
  totalDePaginas: number;
};

/** Arquivo que não é PDF nem imagem que a pilha decodifique. */
export class FormatoNaoSuportadoError extends Error {
  constructor(nomeDoFormato: string) {
    super(nomeDoFormato);
    this.name = "FormatoNaoSuportadoError";
  }
}

/**
 * Texto mínimo, em caracteres, para acreditar que o PDF tem camada de texto.
 *
 * As faturas legíveis desta base trazem entre 1.400 e 2.200 caracteres; uma
 * digitalização traz zero, ou uma dúzia vindos de um carimbo vetorial. O corte
 * é folgado nos dois lados de propósito — não existe fatura de verdade com 200
 * caracteres de conteúdo, então errar aqui exige um caso muito estranho.
 */
const TEXTO_MINIMO = 200;

/**
 * Teto de páginas aproveitadas de um PDF, em qualquer caminho de leitura.
 *
 * Fatura tem uma ou duas páginas; o que passa disso costuma ser um PDF com o
 * histórico anual anexado. No OCR, reconhecer trinta páginas ocupa a fila por
 * minutos para achar o que está na primeira. No texto direto o risco é pior:
 * páginas de histórico repetem a tabela itemizada, cada linha fecha na
 * aritmética consigo mesma, e o consumo sairia somado N vezes sem aviso. As
 * páginas restantes continuam contadas em `totalDePaginas`, então nada é
 * escondido.
 */
const TETO_DE_PAGINAS = 3;

export async function normalizar(
  conteudo: Buffer,
  senha?: string,
): Promise<DocumentoNormalizado> {
  const formato = reconhecerFormato(conteudo);

  if (formato.tipo === "nao_suportado" || formato.tipo === "imagem_nao_suportada") {
    throw new FormatoNaoSuportadoError(formato.nome);
  }

  if (formato.tipo === "imagem") {
    const { pagina, confianca } = await reconhecer(conteudo, 1);
    return { origem: "reconhecimento_optico", paginas: [pagina], confianca, totalDePaginas: 1 };
  }

  const documento = await abrirPdf(conteudo, senha);

  try {
    if (documento.caracteres >= TEXTO_MINIMO) {
      return {
        origem: "texto_direto",
        paginas: documento.paginas.slice(0, TETO_DE_PAGINAS),
        confianca: null,
        totalDePaginas: documento.paginas.length,
      };
    }

    // Sem camada de texto útil: é digitalização de verdade, e agora isso é o
    // começo de um caminho em vez do fim de um.
    const paginas: PaginaDoDocumento[] = [];
    const confiancas: number[] = [];

    for (const original of documento.paginas.slice(0, TETO_DE_PAGINAS)) {
      const imagem = await documento.rasterizar(original.numero);
      const { pagina, confianca } = await reconhecer(imagem, original.numero);
      paginas.push(pagina);
      confiancas.push(confianca);
    }

    return {
      origem: "reconhecimento_optico",
      paginas,
      confianca: confiancas.length
        ? confiancas.reduce((soma, valor) => soma + valor, 0) / confiancas.length
        : 0,
      totalDePaginas: documento.paginas.length,
    };
  } finally {
    await documento.fechar();
  }
}
