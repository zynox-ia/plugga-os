/**
 * O que o arquivo é de fato, pelos primeiros bytes.
 *
 * Nunca pela extensão nem pelo `content-type`: os dois são declarados por quem
 * envia e não provam nada. No corpus do CRM, 18 das 73 faturas são foto
 * renomeada para `.pdf` — confiar no nome faria o leitor tentar abrir um JPEG
 * como PDF e concluir que o PDF está corrompido.
 *
 * A versão anterior fazia essa checagem, mas só para **recusar**: tudo que não
 * começasse com `%PDF-` era devolvido com "foto da conta ainda não é lida".
 * Agora a checagem serve para **rotear** — o formato decide o caminho, e foto
 * de conta tem caminho.
 */

export type FormatoDoArquivo =
  | { tipo: "pdf" }
  | { tipo: "imagem"; mime: string }
  /** Imagem que existe, mas que a pilha não decodifica; `nome` é para a mensagem. */
  | { tipo: "imagem_nao_suportada"; nome: string }
  | { tipo: "nao_suportado"; nome: string };

/** Compara os primeiros bytes com uma assinatura em hexadecimal. */
function comeca(conteudo: Buffer, hex: string): boolean {
  return conteudo.subarray(0, hex.length / 2).toString("hex").toLowerCase() === hex.toLowerCase();
}

/**
 * RIFF carrega o formato real quatro bytes adiante: `RIFF....WEBP`. Sem olhar o
 * marcador de dentro, um `.wav` passaria por imagem.
 */
function ehWebp(conteudo: Buffer): boolean {
  return comeca(conteudo, "52494646") && conteudo.subarray(8, 12).toString("latin1") === "WEBP";
}

/**
 * HEIC/HEIF é caixa ISO-BMFF: os bytes 4..8 são `ftyp` e a marca vem depois.
 * É o formato padrão da câmera do iPhone, então aparece de verdade — e é o
 * único que a pilha não decodifica, por não haver decodificador HEIF puro em
 * JavaScript que valha a dependência.
 */
function ehHeif(conteudo: Buffer): boolean {
  if (conteudo.subarray(4, 8).toString("latin1") !== "ftyp") return false;
  const marca = conteudo.subarray(8, 12).toString("latin1");
  return ["heic", "heix", "hevc", "heim", "heis", "hevm", "mif1", "msf1"].includes(marca);
}

export function reconhecerFormato(conteudo: Buffer): FormatoDoArquivo {
  if (comeca(conteudo, "25504446")) return { tipo: "pdf" };

  if (comeca(conteudo, "ffd8ff")) return { tipo: "imagem", mime: "image/jpeg" };
  if (comeca(conteudo, "89504e470d0a1a0a")) return { tipo: "imagem", mime: "image/png" };
  if (ehWebp(conteudo)) return { tipo: "imagem", mime: "image/webp" };
  if (comeca(conteudo, "47494638")) return { tipo: "imagem", mime: "image/gif" };
  // TIFF nas duas ordens de byte; scanner de escritório ainda produz muito.
  if (comeca(conteudo, "49492a00") || comeca(conteudo, "4d4d002a")) {
    return { tipo: "imagem", mime: "image/tiff" };
  }
  if (comeca(conteudo, "424d")) return { tipo: "imagem", mime: "image/bmp" };

  if (ehHeif(conteudo)) return { tipo: "imagem_nao_suportada", nome: "uma foto HEIC do iPhone" };

  if (comeca(conteudo, "504b0304")) {
    return { tipo: "nao_suportado", nome: "um arquivo ZIP (talvez .docx ou .xlsx)" };
  }
  if (comeca(conteudo, "d0cf11e0")) {
    return { tipo: "nao_suportado", nome: "um documento antigo do Office" };
  }

  return { tipo: "nao_suportado", nome: "de um formato que não reconheço" };
}
