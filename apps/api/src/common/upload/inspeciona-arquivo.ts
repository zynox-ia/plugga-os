import { open } from "node:fs/promises";
import { constants as zlibConstants, inflateSync } from "node:zlib";

import { ArquivoRecusado, TipoNaoPermitido } from "../errors/dominio";

/**
 * Inspeção de arquivo enviado: confere o TIPO pelo conteúdo (bytes mágicos) e
 * lê contagem de páginas e dimensões do cabeçalho, sem extrair texto, sem
 * decodificar imagem e sem dependência nova.
 *
 * O objetivo (FR-044, SC-012) é recusar em milissegundos o que derrubaria o
 * processo se fosse processado: PDF de mil páginas, página de 14.400 pt, PNG
 * que declara bilhões de pixels, executável com nome `.pdf`, arquivo cortado.
 * Toda leitura é limitada (blocos de tamanho fixo); nunca se lê o arquivo
 * inteiro para a memória aqui.
 *
 * Erros: `TipoNaoPermitido` (415) quando o conteúdo não é de um tipo aceito;
 * `ArquivoRecusado` (422) quando é do tipo certo mas corrompido, incompleto ou
 * acima dos limites. As mensagens são para a pessoa e nunca trazem caminho
 * nem detalhe interno.
 */

export type TipoDeConteudo = "pdf" | "png" | "jpeg" | "tiff" | "webp" | "xlsx" | "docx" | "doc";

export const MIME_POR_TIPO: Readonly<Record<TipoDeConteudo, string>> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  tiff: "image/tiff",
  webp: "image/webp",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

export interface LimitesDeInspecao {
  /** PDF: páginas no máximo. */
  maxPaginasPdf: number;
  /** PDF: lado máximo da página em pontos (1/72"). 1.440 pt = 4.000 px a 200 DPI. */
  maxLadoPdfEmPontos: number;
  /** Imagem: total de pixels (4.000 × 4.000). */
  maxPixels: number;
  /** Imagem: maior lado em pixels (barra imagens finas e gigantes que passariam no total). */
  maxLadoPixels: number;
  /** PDF: bytes varridos em busca de páginas. */
  maxBytesVarridosPdf: number;
  /** PDF: bytes que um fluxo comprimido de objetos pode ocupar depois de descompactado. */
  maxBytesDescompactadosPdf: number;
  /** ZIP (xlsx/docx): entradas no diretório central. */
  maxEntradasZip: number;
  /** ZIP: soma dos tamanhos descompactados declarados (barra bomba de compressão). */
  maxBytesDescompactadosZip: number;
}

export const LIMITES_PADRAO: Readonly<LimitesDeInspecao> = {
  maxPaginasPdf: 100,
  maxLadoPdfEmPontos: 1440,
  maxPixels: 4000 * 4000,
  maxLadoPixels: 16000,
  maxBytesVarridosPdf: 64 * 1024 * 1024,
  maxBytesDescompactadosPdf: 32 * 1024 * 1024,
  maxEntradasZip: 2000,
  maxBytesDescompactadosZip: 256 * 1024 * 1024,
};

export interface ResultadoDaInspecao {
  tipo: TipoDeConteudo;
  mime: string;
  tamanho: number;
  paginas?: number;
  /** Pixels (imagem). */
  largura?: number;
  altura?: number;
  /** Pontos (PDF): a maior página. */
  larguraEmPontos?: number;
  alturaEmPontos?: number;
}

export interface OpcoesDeInspecao {
  /** Tipos aceitos pelo fluxo; sem isso, todo tipo reconhecido passa. */
  tiposPermitidos?: readonly TipoDeConteudo[];
  limites?: Partial<LimitesDeInspecao>;
}

/** Tipos reconhecidos a partir do mime aceito pelo fluxo (o que o controller já declara). */
export function tiposDosMimes(mimes: readonly string[]): TipoDeConteudo[] {
  return (Object.keys(MIME_POR_TIPO) as TipoDeConteudo[]).filter((tipo) =>
    mimes.includes(MIME_POR_TIPO[tipo]),
  );
}

// ---------------------------------------------------------------------------
// Leitura limitada
// ---------------------------------------------------------------------------

interface Leitor {
  readonly tamanho: number;
  /** Lê até `n` bytes a partir de `pos` (menos, se o arquivo acabar antes). */
  ler(pos: number, n: number): Promise<Buffer>;
  fechar(): Promise<void>;
}

function leitorDeBuffer(buffer: Buffer): Leitor {
  return {
    tamanho: buffer.length,
    ler: async (pos, n) => buffer.subarray(pos, pos + n),
    fechar: async () => undefined,
  };
}

async function leitorDeArquivo(caminho: string): Promise<Leitor> {
  const arquivo = await open(caminho, "r");
  const { size } = await arquivo.stat();
  return {
    tamanho: size,
    async ler(pos, n) {
      const alvo = Math.max(0, Math.min(n, size - pos));
      const buffer = Buffer.allocUnsafe(alvo);
      let lidos = 0;
      while (lidos < alvo) {
        const { bytesRead } = await arquivo.read(buffer, lidos, alvo - lidos, pos + lidos);
        if (bytesRead === 0) break;
        lidos += bytesRead;
      }
      return buffer.subarray(0, lidos);
    },
    fechar: () => arquivo.close(),
  };
}

const recusa = (mensagem: string): ArquivoRecusado => new ArquivoRecusado(mensagem);

/** Lê exatamente `n` bytes; menos que isso é arquivo cortado. */
async function exato(leitor: Leitor, pos: number, n: number): Promise<Buffer> {
  const buffer = await leitor.ler(pos, n);
  if (buffer.length < n) throw recusa("O arquivo está incompleto ou corrompido.");
  return buffer;
}

function confere(buffer: Buffer, deslocamento: number, esperado: readonly number[]): boolean {
  return esperado.every((byte, i) => buffer[deslocamento + i] === byte);
}

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ASSINATURA_OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

type TipoDetectado = TipoDeConteudo | "zip";

function detectar(cabecalho: Buffer): TipoDetectado | null {
  if (confere(cabecalho, 0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (confere(cabecalho, 0, ASSINATURA_PNG)) return "png";
  if (confere(cabecalho, 0, [0xff, 0xd8, 0xff])) return "jpeg";
  if (confere(cabecalho, 0, [0x49, 0x49, 0x2a, 0x00]) || confere(cabecalho, 0, [0x4d, 0x4d, 0x00, 0x2a])) {
    return "tiff";
  }
  if (confere(cabecalho, 0, [0x52, 0x49, 0x46, 0x46]) && confere(cabecalho, 8, [0x57, 0x45, 0x42, 0x50])) {
    return "webp";
  }
  if (confere(cabecalho, 0, [0x50, 0x4b, 0x03, 0x04])) return "zip";
  if (confere(cabecalho, 0, ASSINATURA_OLE)) return "doc";
  return null;
}

// ---------------------------------------------------------------------------
// Imagens
// ---------------------------------------------------------------------------

function validarPixels(largura: number, altura: number, lim: LimitesDeInspecao): void {
  if (largura <= 0 || altura <= 0) throw recusa("A imagem tem dimensões inválidas.");
  if (largura > lim.maxLadoPixels || altura > lim.maxLadoPixels || largura * altura > lim.maxPixels) {
    throw recusa(
      `A imagem (${largura} × ${altura} px) é maior que o limite de ${Math.round(lim.maxPixels / 1_000_000)} megapixels.`,
    );
  }
}

async function inspecionarPng(leitor: Leitor, lim: LimitesDeInspecao): Promise<Partial<ResultadoDaInspecao>> {
  const cabecalho = await exato(leitor, 0, 24);
  // Depois da assinatura vem o IHDR: tamanho 13, nome "IHDR", largura e altura (4 bytes cada).
  if (cabecalho.readUInt32BE(8) !== 13 || cabecalho.toString("latin1", 12, 16) !== "IHDR") {
    throw recusa("O arquivo PNG está corrompido.");
  }
  const largura = cabecalho.readUInt32BE(16);
  const altura = cabecalho.readUInt32BE(20);
  validarPixels(largura, altura, lim);
  // Termina com o bloco IEND (comprimento 0, nome, CRC fixo); sem ele o arquivo foi cortado.
  const cauda = await exato(leitor, Math.max(0, leitor.tamanho - 12), Math.min(12, leitor.tamanho));
  if (cauda.length < 12 || cauda.toString("latin1", 4, 8) !== "IEND") {
    throw recusa("O arquivo PNG está incompleto.");
  }
  return { largura, altura };
}

const MARCADORES_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

async function inspecionarJpeg(leitor: Leitor, lim: LimitesDeInspecao): Promise<Partial<ResultadoDaInspecao>> {
  let pos = 2;
  let dimensoes: { largura: number; altura: number } | null = null;
  // Anda de segmento em segmento até o quadro de início (SOF); limita as voltas.
  for (let volta = 0; volta < 4096 && pos + 4 <= leitor.tamanho; volta += 1) {
    const topo = await exato(leitor, pos, 4);
    if (topo[0] !== 0xff) throw recusa("O arquivo JPEG está corrompido.");
    const marcador = topo[1]!;
    if (marcador === 0xff) {
      pos += 1; // byte de preenchimento
      continue;
    }
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd8)) {
      pos += 2; // marcadores sem corpo
      continue;
    }
    if (marcador === 0xd9 || marcador === 0xda) break; // fim ou início dos dados sem ter achado o SOF
    const comprimento = topo.readUInt16BE(2);
    if (comprimento < 2) throw recusa("O arquivo JPEG está corrompido.");
    if (MARCADORES_SOF.has(marcador)) {
      const quadro = await exato(leitor, pos + 4, 5);
      dimensoes = { altura: quadro.readUInt16BE(1), largura: quadro.readUInt16BE(3) };
      break;
    }
    pos += 2 + comprimento;
  }
  if (!dimensoes) throw recusa("Não foi possível ler as dimensões do JPEG.");
  validarPixels(dimensoes.largura, dimensoes.altura, lim);

  // Termina com EOI (FF D9), às vezes seguido de zeros de preenchimento.
  const cauda = await leitor.ler(Math.max(0, leitor.tamanho - 64), 64);
  let fim = cauda.length;
  while (fim > 0 && cauda[fim - 1] === 0x00) fim -= 1;
  if (fim < 2 || cauda[fim - 2] !== 0xff || cauda[fim - 1] !== 0xd9) {
    throw recusa("O arquivo JPEG está incompleto.");
  }
  return dimensoes;
}

async function inspecionarTiff(leitor: Leitor, lim: LimitesDeInspecao): Promise<Partial<ResultadoDaInspecao>> {
  const cabecalho = await exato(leitor, 0, 8);
  const little = cabecalho[0] === 0x49;
  const u16 = (b: Buffer, o: number): number => (little ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const u32 = (b: Buffer, o: number): number => (little ? b.readUInt32LE(o) : b.readUInt32BE(o));

  const inicio = u32(cabecalho, 4);
  if (inicio < 8 || inicio + 2 > leitor.tamanho) throw recusa("O arquivo TIFF está corrompido ou incompleto.");
  const quantidade = u16(await exato(leitor, inicio, 2), 0);
  if (quantidade === 0 || quantidade > 4096) throw recusa("O arquivo TIFF está corrompido.");
  const entradas = await exato(leitor, inicio + 2, quantidade * 12);

  let largura = 0;
  let altura = 0;
  for (let i = 0; i < quantidade; i += 1) {
    const base = i * 12;
    const etiqueta = u16(entradas, base);
    const tipo = u16(entradas, base + 2);
    if (etiqueta !== 256 && etiqueta !== 257) continue;
    const valor = tipo === 3 ? u16(entradas, base + 8) : tipo === 4 ? u32(entradas, base + 8) : 0;
    if (etiqueta === 256) largura = valor;
    else altura = valor;
  }
  if (!largura || !altura) throw recusa("Não foi possível ler as dimensões do TIFF.");
  validarPixels(largura, altura, lim);
  return { largura, altura };
}

async function inspecionarWebp(leitor: Leitor, lim: LimitesDeInspecao): Promise<Partial<ResultadoDaInspecao>> {
  const cabecalho = await exato(leitor, 0, 30);
  // O tamanho do RIFF cobre o arquivo todo; se passa do que existe, foi cortado.
  if (8 + cabecalho.readUInt32LE(4) > leitor.tamanho) throw recusa("O arquivo WebP está incompleto.");
  const bloco = cabecalho.toString("latin1", 12, 16);
  let largura: number;
  let altura: number;
  if (bloco === "VP8 ") {
    if (!confere(cabecalho, 23, [0x9d, 0x01, 0x2a])) throw recusa("O arquivo WebP está corrompido.");
    largura = cabecalho.readUInt16LE(26) & 0x3fff;
    altura = cabecalho.readUInt16LE(28) & 0x3fff;
  } else if (bloco === "VP8L") {
    if (cabecalho[20] !== 0x2f) throw recusa("O arquivo WebP está corrompido.");
    const bits = cabecalho.readUInt32LE(21);
    largura = (bits & 0x3fff) + 1;
    altura = ((bits >>> 14) & 0x3fff) + 1;
  } else if (bloco === "VP8X") {
    largura = 1 + cabecalho.readUIntLE(24, 3);
    altura = 1 + cabecalho.readUIntLE(27, 3);
  } else {
    throw recusa("O arquivo WebP está corrompido.");
  }
  validarPixels(largura, altura, lim);
  return { largura, altura };
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

const BLOCO_PDF = 1024 * 1024;
/** Maior trecho que uma expressão procurada ocupa; blocos se sobrepõem por isso. */
const SOBREPOSICAO_PDF = 4096;

interface AcumuladoPdf {
  objetosDePagina: number;
  contagemDeclarada: number;
  larguraMax: number;
  alturaMax: number;
  unidade: number;
  fluxosDeObjetos: number[];
}

const RE_PAGINA = /\/Type\s*\/Page(?![A-Za-z])/g;
const RE_NO_DE_PAGINAS = /\/Type\s*\/Pages(?![A-Za-z])/g;
const RE_CONTAGEM = /\/Count\s+(\d{1,9})(?!\d)/;
const RE_CAIXA = /\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/g;
const RE_UNIDADE = /\/UserUnit\s+([\d.]+)/g;
const RE_FLUXO_DE_OBJETOS = /\/Type\s*\/ObjStm(?![A-Za-z])/g;

/** Conta páginas, caixas e fluxos de objetos de um trecho; só vale o que começa antes de `limite`. */
function analisarTrechoPdf(texto: string, limite: number, base: number, acc: AcumuladoPdf, ehFluxo: boolean): void {
  for (const m of texto.matchAll(RE_PAGINA)) {
    if (m.index < limite) acc.objetosDePagina += 1;
  }
  for (const m of texto.matchAll(RE_NO_DE_PAGINAS)) {
    if (m.index >= limite) continue;
    // O /Count do nó de páginas fica no mesmo dicionário; a janela evita pegar o /Count de marcadores.
    const janela = texto.slice(Math.max(0, m.index - 1500), m.index + 1500);
    const contagem = RE_CONTAGEM.exec(janela);
    if (contagem) acc.contagemDeclarada = Math.max(acc.contagemDeclarada, Number(contagem[1]));
  }
  for (const m of texto.matchAll(RE_CAIXA)) {
    if (m.index >= limite) continue;
    const [a, b, c, d] = [m[1], m[2], m[3], m[4]].map(Number) as [number, number, number, number];
    if ([a, b, c, d].some((n) => !Number.isFinite(n))) continue;
    acc.larguraMax = Math.max(acc.larguraMax, Math.abs(c - a));
    acc.alturaMax = Math.max(acc.alturaMax, Math.abs(d - b));
  }
  for (const m of texto.matchAll(RE_UNIDADE)) {
    const unidade = Number(m[1]);
    if (m.index < limite && Number.isFinite(unidade)) acc.unidade = Math.max(acc.unidade, unidade);
  }
  if (!ehFluxo) {
    for (const m of texto.matchAll(RE_FLUXO_DE_OBJETOS)) {
      if (m.index < limite && acc.fluxosDeObjetos.length < 512) acc.fluxosDeObjetos.push(base + m.index);
    }
  }
}

/** Descompacta (com teto de saída) o fluxo de objetos cujo dicionário contém `posicao`. */
async function lerFluxoDeObjetos(leitor: Leitor, posicao: number, tetoDeSaida: number): Promise<string | null> {
  const inicio = Math.max(0, posicao - 512);
  const janela = (await leitor.ler(inicio, 512 + 4096)).toString("latin1");
  const relativa = posicao - inicio;
  const fimDoDicionario = janela.indexOf("stream", relativa);
  if (fimDoDicionario < 0) return null;
  const dicionario = janela.slice(janela.lastIndexOf("obj", relativa), fimDoDicionario);
  if (!/\/FlateDecode/.test(dicionario)) return null; // sem compressão: a varredura bruta já o leu
  let dados = inicio + fimDoDicionario + "stream".length;
  const fimDeLinha = await leitor.ler(dados, 2);
  if (fimDeLinha[0] === 0x0d && fimDeLinha[1] === 0x0a) dados += 2;
  else if (fimDeLinha[0] === 0x0a || fimDeLinha[0] === 0x0d) dados += 1;

  const declarado = /\/Length\s+(\d{1,9})(?!\s+\d+\s+R)/.exec(dicionario);
  const comprimento = Math.min(declarado ? Number(declarado[1]) : 4 * 1024 * 1024, 4 * 1024 * 1024);
  const comprimidos = await leitor.ler(dados, comprimento);
  try {
    return inflateSync(comprimidos, {
      maxOutputLength: tetoDeSaida,
      finishFlush: zlibConstants.Z_SYNC_FLUSH,
    }).toString("latin1");
  } catch (erro) {
    if ((erro as { code?: string }).code === "ERR_BUFFER_TOO_LARGE") {
      throw recusa("O PDF contém dados comprimidos grandes demais.");
    }
    return null; // fluxo ilegível: não conta, e a ausência de páginas é tratada adiante
  }
}

async function inspecionarPdf(leitor: Leitor, lim: LimitesDeInspecao): Promise<Partial<ResultadoDaInspecao>> {
  if (leitor.tamanho > lim.maxBytesVarridosPdf) throw recusa("O PDF é grande demais para ser processado.");

  // Todo PDF termina com %%EOF; sem isso o arquivo foi cortado.
  const cauda = await leitor.ler(Math.max(0, leitor.tamanho - 2048), 2048);
  if (!cauda.toString("latin1").includes("%%EOF")) throw recusa("O PDF está incompleto ou corrompido.");

  const acc: AcumuladoPdf = {
    objetosDePagina: 0,
    contagemDeclarada: 0,
    larguraMax: 0,
    alturaMax: 0,
    unidade: 1,
    fluxosDeObjetos: [],
  };
  const estourou = (): boolean => {
    const unidade = acc.unidade || 1;
    return (
      Math.max(acc.objetosDePagina, acc.contagemDeclarada) > lim.maxPaginasPdf ||
      acc.larguraMax * unidade > lim.maxLadoPdfEmPontos ||
      acc.alturaMax * unidade > lim.maxLadoPdfEmPontos
    );
  };

  for (let pos = 0; pos < leitor.tamanho; pos += BLOCO_PDF) {
    const bloco = await leitor.ler(pos, BLOCO_PDF + SOBREPOSICAO_PDF);
    const ultimo = pos + BLOCO_PDF >= leitor.tamanho;
    analisarTrechoPdf(bloco.toString("latin1"), ultimo ? bloco.length : BLOCO_PDF, pos, acc, false);
    if (estourou()) break; // já dá para recusar; não precisa varrer o resto
  }

  let descompactados = 0;
  for (const posicao of acc.fluxosDeObjetos) {
    if (estourou()) break;
    const restante = lim.maxBytesDescompactadosPdf - descompactados;
    if (restante <= 0) throw recusa("O PDF contém dados comprimidos grandes demais.");
    const texto = await lerFluxoDeObjetos(leitor, posicao, restante);
    if (texto === null) continue;
    descompactados += texto.length;
    analisarTrechoPdf(texto, texto.length, 0, acc, true);
  }

  const paginas = Math.max(acc.objetosDePagina, acc.contagemDeclarada);
  const unidade = acc.unidade || 1;
  const larguraEmPontos = Math.round(acc.larguraMax * unidade);
  const alturaEmPontos = Math.round(acc.alturaMax * unidade);

  if (paginas > lim.maxPaginasPdf) {
    throw recusa(`O PDF tem ${paginas} páginas; o máximo permitido é ${lim.maxPaginasPdf}.`);
  }
  if (larguraEmPontos > lim.maxLadoPdfEmPontos || alturaEmPontos > lim.maxLadoPdfEmPontos) {
    throw recusa(
      `O PDF tem página de ${larguraEmPontos} × ${alturaEmPontos} pt; o máximo permitido é ${lim.maxLadoPdfEmPontos} pt por lado.`,
    );
  }
  if (paginas === 0) throw recusa("Não foi possível identificar páginas no PDF.");
  return { paginas, larguraEmPontos, alturaEmPontos };
}

// ---------------------------------------------------------------------------
// ZIP (xlsx, docx): só o diretório central, nada é descompactado
// ---------------------------------------------------------------------------

async function inspecionarZip(
  leitor: Leitor,
  lim: LimitesDeInspecao,
): Promise<{ tipo: TipoDeConteudo | null }> {
  const janelaFinal = Math.min(leitor.tamanho, 65557);
  const cauda = await exato(leitor, leitor.tamanho - janelaFinal, janelaFinal);
  const eocd = cauda.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > cauda.length) throw recusa("O arquivo está incompleto ou corrompido.");

  const entradas = cauda.readUInt16LE(eocd + 10);
  const tamanhoDoDiretorio = cauda.readUInt32LE(eocd + 12);
  const inicioDoDiretorio = cauda.readUInt32LE(eocd + 16);
  if (entradas === 0xffff || tamanhoDoDiretorio === 0xffffffff || inicioDoDiretorio === 0xffffffff) {
    throw recusa("O arquivo compactado usa um formato não suportado.");
  }
  if (
    entradas === 0 ||
    entradas > lim.maxEntradasZip ||
    tamanhoDoDiretorio > 4 * 1024 * 1024 ||
    inicioDoDiretorio + tamanhoDoDiretorio > leitor.tamanho
  ) {
    throw recusa("O arquivo compactado está corrompido ou tem estrutura acima do limite.");
  }

  const diretorio = await exato(leitor, inicioDoDiretorio, tamanhoDoDiretorio);
  const nomes = new Set<string>();
  let descompactado = 0;
  let p = 0;
  for (let i = 0; i < entradas; i += 1) {
    if (p + 46 > diretorio.length || diretorio.readUInt32LE(p) !== 0x02014b50) {
      throw recusa("O arquivo compactado está corrompido.");
    }
    descompactado += diretorio.readUInt32LE(p + 24);
    const nome = diretorio.readUInt16LE(p + 28);
    const extra = diretorio.readUInt16LE(p + 30);
    const comentario = diretorio.readUInt16LE(p + 32);
    if (p + 46 + nome > diretorio.length) throw recusa("O arquivo compactado está corrompido.");
    nomes.add(diretorio.toString("utf8", p + 46, p + 46 + nome));
    p += 46 + nome + extra + comentario;
  }
  if (descompactado > lim.maxBytesDescompactadosZip) {
    throw recusa("O conteúdo do arquivo, descompactado, passa do limite permitido.");
  }
  if (!nomes.has("[Content_Types].xml")) return { tipo: null };
  if (nomes.has("xl/workbook.xml")) return { tipo: "xlsx" };
  if (nomes.has("word/document.xml")) return { tipo: "docx" };
  return { tipo: null };
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/**
 * Inspeciona o arquivo em `origem` (caminho em disco ou buffer).
 * Recusa por `TipoNaoPermitido` / `ArquivoRecusado`; devolve o tipo real e as
 * medidas lidas do cabeçalho quando está tudo dentro dos limites.
 */
export async function inspecionarArquivo(
  origem: string | Buffer,
  opcoes: OpcoesDeInspecao = {},
): Promise<ResultadoDaInspecao> {
  const lim: LimitesDeInspecao = { ...LIMITES_PADRAO, ...opcoes.limites };
  const leitor = typeof origem === "string" ? await leitorDeArquivo(origem) : leitorDeBuffer(origem);
  try {
    if (leitor.tamanho === 0) throw recusa("O arquivo está vazio.");

    const detectado = detectar(await leitor.ler(0, 16));
    if (!detectado) throw new TipoNaoPermitido("O conteúdo do arquivo não é de um tipo permitido.");

    const permitidos = opcoes.tiposPermitidos;
    const naoPermitido = (): TipoNaoPermitido =>
      new TipoNaoPermitido("O conteúdo do arquivo não é de um tipo permitido para este envio.");
    if (detectado !== "zip" && permitidos && !permitidos.includes(detectado)) throw naoPermitido();

    let tipo: TipoDeConteudo;
    let medidas: Partial<ResultadoDaInspecao> = {};
    switch (detectado) {
      case "pdf":
        tipo = "pdf";
        medidas = await inspecionarPdf(leitor, lim);
        break;
      case "png":
        tipo = "png";
        medidas = await inspecionarPng(leitor, lim);
        break;
      case "jpeg":
        tipo = "jpeg";
        medidas = await inspecionarJpeg(leitor, lim);
        break;
      case "tiff":
        tipo = "tiff";
        medidas = await inspecionarTiff(leitor, lim);
        break;
      case "webp":
        tipo = "webp";
        medidas = await inspecionarWebp(leitor, lim);
        break;
      case "doc":
        tipo = "doc";
        break;
      case "docx":
      case "xlsx":
        throw naoPermitido(); // inalcançável: `detectar` só devolve "zip" para esses
      case "zip": {
        const { tipo: dentro } = await inspecionarZip(leitor, lim);
        if (!dentro || (permitidos && !permitidos.includes(dentro))) throw naoPermitido();
        tipo = dentro;
        break;
      }
    }
    return { tipo, mime: MIME_POR_TIPO[tipo], tamanho: leitor.tamanho, ...medidas };
  } finally {
    await leitor.fechar();
  }
}
