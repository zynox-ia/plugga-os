import type { LeadDocumentAcceptedMime } from "@plugga/shared";

/**
 * O tipo vem do conteúdo, nunca do nome nem do `Content-Type` que o navegador
 * mandou: um `.pdf` com bytes de HTML é recusado, e um `.docx` (ZIP) precisa
 * ter a estrutura OOXML mínima, não só a assinatura de ZIP.
 *
 * Duas recusas diferentes: um arquivo sem nenhuma assinatura aceita (ou um
 * ZIP que não é um Office reconhecível) é "tipo não permitido" (415); um ZIP
 * que começa certo mas tem o diretório central truncado/corrompido ou excede
 * os tetos de entradas/tamanho descompactado é "arquivo recusado" (422) —
 * o tipo é o certo, o conteúdo é que não presta.
 */

export type ResultadoDeteccao =
  | { status: "aceito"; tipo: LeadDocumentAcceptedMime }
  | { status: "tipo_nao_permitido" }
  | { status: "arquivo_recusado" };

const PK_LOCAL = [0x50, 0x4b, 0x03, 0x04] as const;
const PK_EMPTY = [0x50, 0x4b, 0x05, 0x06] as const;
const PK_CENTRAL = [0x50, 0x4b, 0x01, 0x02] as const;
const TAMANHO_EOCD = 22;
const MAX_ENTRADAS_ZIP = 2000;
const MAX_BYTES_DESCOMPACTADOS = 200 * 1024 * 1024;

function temAssinatura(buffer: Buffer, assinatura: readonly number[], offset = 0): boolean {
  if (buffer.length < offset + assinatura.length) return false;
  return assinatura.every((byte, i) => buffer[offset + i] === byte);
}

type Eocd = { totalEntradas: number; offsetCentral: number; tamanhoCentral: number };

/** Procura o fim do diretório central a partir do fim do arquivo (o comentário tem tamanho variável). */
function encontrarEocd(buffer: Buffer): Eocd | null {
  const inicioBusca = Math.max(0, buffer.length - TAMANHO_EOCD - 65_536);
  for (let i = buffer.length - TAMANHO_EOCD; i >= inicioBusca; i--) {
    if (temAssinatura(buffer, PK_EMPTY, i)) {
      return {
        totalEntradas: buffer.readUInt16LE(i + 10),
        tamanhoCentral: buffer.readUInt32LE(i + 12),
        offsetCentral: buffer.readUInt32LE(i + 16),
      };
    }
  }
  return null;
}

type AnaliseZip = { ok: true; nomes: Set<string> } | { ok: false; recusado: boolean };

/**
 * Lê só os metadados do diretório central (nomes e tamanhos declarados), sem
 * descompactar nada: suficiente para achar os arquivos-marca do OOXML e
 * recusar um ZIP com entradas ou tamanho descompactado acima do teto.
 * `recusado: true` significa "é um ZIP de verdade (tem EOCD), mas truncado,
 * corrompido ou acima dos tetos de segurança" — nunca "não é um ZIP".
 */
function analisarZip(buffer: Buffer): AnaliseZip {
  const eocd = encontrarEocd(buffer);
  if (!eocd) return { ok: false, recusado: false };
  if (eocd.totalEntradas > MAX_ENTRADAS_ZIP) return { ok: false, recusado: true };
  if (eocd.offsetCentral + eocd.tamanhoCentral > buffer.length) return { ok: false, recusado: true };

  const nomes = new Set<string>();
  let somaDescompactada = 0;
  let cursor = eocd.offsetCentral;
  for (let i = 0; i < eocd.totalEntradas; i++) {
    if (cursor + 46 > buffer.length || !temAssinatura(buffer, PK_CENTRAL, cursor)) return { ok: false, recusado: true };
    const tamanhoDescompactado = buffer.readUInt32LE(cursor + 24);
    const tamanhoNome = buffer.readUInt16LE(cursor + 28);
    const tamanhoExtra = buffer.readUInt16LE(cursor + 30);
    const tamanhoComentario = buffer.readUInt16LE(cursor + 32);
    somaDescompactada += tamanhoDescompactado;
    if (somaDescompactada > MAX_BYTES_DESCOMPACTADOS) return { ok: false, recusado: true };
    const fimNome = cursor + 46 + tamanhoNome;
    if (fimNome > buffer.length) return { ok: false, recusado: true };
    nomes.add(buffer.subarray(cursor + 46, fimNome).toString("utf8"));
    cursor = fimNome + tamanhoExtra + tamanhoComentario;
  }
  return { ok: true, nomes };
}

type ResultadoOoxml = { tipo: LeadDocumentAcceptedMime } | { recusado: true } | null;

/** OOXML mínimo: `[Content_Types].xml` sempre presente, mais o arquivo-marca do formato. */
function tipoOoxml(buffer: Buffer): ResultadoOoxml {
  const analise = analisarZip(buffer);
  if (!analise.ok) return analise.recusado ? { recusado: true } : null;
  if (!analise.nomes.has("[Content_Types].xml")) return null;
  if (analise.nomes.has("word/document.xml")) {
    return { tipo: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }
  if (analise.nomes.has("xl/workbook.xml")) {
    return { tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }
  return null;
}

export function detectarTipo(buffer: Buffer): ResultadoDeteccao {
  if (temAssinatura(buffer, [0x25, 0x50, 0x44, 0x46])) return { status: "aceito", tipo: "application/pdf" }; // %PDF
  if (temAssinatura(buffer, [0xff, 0xd8, 0xff])) return { status: "aceito", tipo: "image/jpeg" };
  if (temAssinatura(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { status: "aceito", tipo: "image/png" };
  if (temAssinatura(buffer, PK_LOCAL) || temAssinatura(buffer, PK_EMPTY)) {
    const resultado = tipoOoxml(buffer);
    if (resultado === null) return { status: "tipo_nao_permitido" };
    if ("recusado" in resultado) return { status: "arquivo_recusado" };
    return { status: "aceito", tipo: resultado.tipo };
  }
  return { status: "tipo_nao_permitido" };
}
