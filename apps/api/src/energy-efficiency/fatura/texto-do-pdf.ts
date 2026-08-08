import { inflateSync } from "node:zlib";

/**
 * Texto da fatura da distribuidora, a partir do PDF.
 *
 * Três casos aparecem no corpus real e a extração ingênua confunde os três num
 * só "deu lixo":
 *
 * 1. **texto direto** — a fonte tem `/ToUnicode`, os bytes já são caracteres.
 * 2. **fonte codificada** — fonte com subconjunto de glifos em `Identity-H`:
 *    cada glifo ocupa **dois bytes** e o valor é o índice na tabela da fonte,
 *    não o caractere. Como o subconjunto é montado em ordem, vale
 *    `índice + deslocamento = caractere`. O deslocamento é constante por
 *    documento e é **derivado**, nunca fixado: nas amostras deu sempre +29, mas
 *    isso é observação, não regra.
 * 3. **digitalização** — não há texto nenhum, só imagem. Exige OCR, e aqui a
 *    resposta é dizer isso alto em vez de devolver campo vazio.
 *
 * O erro que custou caro na investigação: tratar o caso 2 como deslocamento de
 * um byte. O byte alto (0x00) virava caractere de controle invisível, o texto
 * *parecia* certo no terminal e nenhuma busca por palavra casava.
 */

export type OrigemDoTexto = "texto_direto" | "fonte_codificada" | "digitalizacao";

export type TextoDoPdf = {
  origem: OrigemDoTexto;
  linhas: string[];
  /** Deslocamento derivado, só quando a origem é fonte codificada. */
  deslocamento: number | null;
};

/**
 * Palavras que aparecem em fatura de energia de qualquer distribuidora. Servem
 * para reconhecer que a decodificação acertou — o próprio acerto é a prova.
 */
const VOCABULARIO = [
  "Consumo",
  "Demanda",
  "Ponta",
  "kWh",
  "Tarifa",
  "Energia",
  "Leitura",
  "CNPJ",
  "ICMS",
  "Fatura",
  "Vencimento",
  "Total",
];

/** Confiança mínima para aceitar uma decodificação como legível. */
const ACERTOS_MINIMOS = 3;

/** Descomprime todo stream Flate do arquivo; o resto é imagem ou fonte. */
function inflarStreams(pdf: Buffer): string {
  const cru = pdf.toString("latin1");
  const pedacos: string[] = [];
  let posicao = 0;

  for (;;) {
    const inicio = cru.indexOf("stream", posicao);
    if (inicio === -1) break;

    let dados = inicio + "stream".length;
    if (cru[dados] === "\r") dados += 1;
    if (cru[dados] === "\n") dados += 1;

    const fim = cru.indexOf("endstream", dados);
    if (fim === -1) break;

    try {
      pedacos.push(inflateSync(Buffer.from(cru.slice(dados, fim), "latin1")).toString("latin1"));
    } catch {
      // Stream não-Flate: imagem JPEG, fonte embutida, metadado. Ignorado de
      // propósito — não é texto de página.
    }
    posicao = fim + "endstream".length;
  }

  return pedacos.join("\n");
}

/**
 * Literais de texto do conteúdo da página, com os bytes preservados.
 *
 * Cada bloco `Tj`/`TJ` vira uma linha. Dentro de um `TJ` os números são
 * espaçamento, não texto, e são descartados — juntar os literais sem eles é o
 * que reconstrói a palavra.
 */
function literaisDeTexto(conteudo: string): string[] {
  const linhas: string[] = [];

  for (const bloco of conteudo.matchAll(/\[(?:\\.|[^\]\\])*\]\s*TJ|\((?:\\.|[^()\\])*\)\s*Tj|<[0-9A-Fa-f\s]*>\s*Tj/g)) {
    let linha = "";

    for (const literal of bloco[0].matchAll(/\((?:\\.|[^()\\])*\)/g)) {
      linha += literal[0]
        .slice(1, -1)
        .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)))
        .replace(/\\(.)/g, "$1");
    }

    // Strings hexadecimais: <0044004F> é a outra forma de escrever o mesmo.
    for (const hex of bloco[0].matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
      const limpo = (hex[1] ?? "").replace(/\s+/g, "");
      for (let i = 0; i + 1 < limpo.length; i += 2) {
        linha += String.fromCharCode(parseInt(limpo.slice(i, i + 2), 16));
      }
    }

    if (linha) linhas.push(linha);
  }

  return linhas;
}

/** Só letras e dígitos: a comparação não pode depender de espaço nem acento. */
function esqueleto(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]/gu, "");
}

function acertos(texto: string): number {
  const limpo = esqueleto(texto);
  return VOCABULARIO.reduce((soma, palavra) => soma + limpo.split(esqueleto(palavra)).length - 1, 0);
}

/** Cada par de bytes vira um código de glifo. */
function codigosDeGlifo(bytes: string): number[] {
  const codigos: number[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    codigos.push((bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1));
  }
  return codigos;
}

/**
 * Palavras-âncora para descobrir o deslocamento. Precisam ser longas o
 * bastante para não casarem por acaso e aparecer em fatura de qualquer
 * distribuidora.
 */
const ANCORAS = ["Consumo", "Energia", "Demanda", "Leitura", "Vencimento"];

/** Diferenças entre caracteres consecutivos — o que o deslocamento não muda. */
function assinatura(palavra: string): number[] {
  const passos: number[] = [];
  for (let i = 1; i < palavra.length; i++) {
    passos.push(palavra.charCodeAt(i) - palavra.charCodeAt(i - 1));
  }
  return passos;
}

/**
 * Descobre o deslocamento da fonte em uma passada, sem testar candidatos.
 *
 * A chave: somar uma constante a todos os códigos **não muda a diferença entre
 * códigos vizinhos**. Então a assinatura de "Consumo" na fatura é a mesma
 * esteja ela deslocada de 29 ou de 4.000. Achada a assinatura, o deslocamento
 * sai por subtração — exato, sem chute.
 *
 * A versão anterior testava cada deslocamento possível e decodificava o texto
 * inteiro a cada tentativa: 27 segundos por fatura contra alguns milissegundos
 * aqui.
 */
function derivarDeslocamento(codigos: number[]): { deslocamento: number; acertos: number } | null {
  if (codigos.length < 8) return null;

  const passos: number[] = [];
  for (let i = 1; i < codigos.length; i++) passos.push((codigos[i] ?? 0) - (codigos[i - 1] ?? 0));

  const candidatos = new Map<number, number>();

  for (const ancora of ANCORAS) {
    const alvo = assinatura(ancora);

    for (let i = 0; i + alvo.length <= passos.length; i++) {
      let bate = true;
      for (let j = 0; j < alvo.length; j++) {
        if (passos[i + j] !== alvo[j]) {
          bate = false;
          break;
        }
      }
      if (!bate) continue;

      const deslocamento = ancora.charCodeAt(0) - (codigos[i] ?? 0);
      candidatos.set(deslocamento, (candidatos.get(deslocamento) ?? 0) + 1);
    }
  }

  if (candidatos.size === 0) return null;

  // O deslocamento certo aparece em toda âncora; coincidência aparece uma vez.
  const vencedor = [...candidatos].sort((a, b) => b[1] - a[1])[0];
  if (!vencedor) return null;

  const [deslocamento, vezes] = vencedor;
  return vezes >= 2 ? { deslocamento, acertos: vezes } : null;
}

/**
 * Reagrupa em linhas legíveis, tirando os separadores de controle.
 *
 * Filtro por código, não por expressão regular: o byte alto de cada glifo vira
 * caractere de controle, que é invisível no editor — foi justamente o que fez a
 * leitura *parecer* correta durante a investigação. Escrito assim, a intenção
 * fica dita em vez de escondida numa faixa de escape.
 */
function limpar(linhas: string[]): string[] {
  return linhas
    .map((linha) =>
      [...linha]
        .filter((caractere) => caractere.charCodeAt(0) >= 32)
        .join("")
        .trim(),
    )
    .filter((linha) => linha.length > 0);
}

export function extrairTexto(pdf: Buffer): TextoDoPdf {
  const brutas = literaisDeTexto(inflarStreams(pdf));
  const juntas = brutas.join("\n");

  // Sem texto nenhum: é digitalização, e não adianta insistir. O corte é só
  // para o caso trivial — quem decide se a fatura é legível é o vocabulário
  // reconhecido, não o tamanho do arquivo.
  if (juntas.length < 40) {
    return { origem: "digitalizacao", linhas: [], deslocamento: null };
  }

  if (acertos(juntas) >= ACERTOS_MINIMOS) {
    return { origem: "texto_direto", linhas: limpar(brutas), deslocamento: null };
  }

  const derivado = derivarDeslocamento(codigosDeGlifo(juntas));
  if (!derivado) {
    // Há texto, mas nenhuma decodificação produz vocabulário de fatura. Pode
    // ser layout novo ou fonte com mapa irregular — tratado como ilegível, que
    // é honesto, em vez de devolver campos pela metade.
    return { origem: "digitalizacao", linhas: [], deslocamento: null };
  }

  const decodificadas = brutas.map((linha) =>
    codigosDeGlifo(linha)
      .map((codigo) => String.fromCharCode(codigo + derivado.deslocamento))
      .join(""),
  );

  return {
    origem: "fonte_codificada",
    linhas: limpar(decodificadas),
    deslocamento: derivado.deslocamento,
  };
}
