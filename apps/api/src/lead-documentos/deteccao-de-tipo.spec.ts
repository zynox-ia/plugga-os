import { describe, expect, it } from "vitest";

import { detectarTipo } from "./deteccao-de-tipo";

function cabecalhoCentral(nome: string, tamanhoDescompactado = 0): Buffer {
  const nomeBuf = Buffer.from(nome, "utf8");
  const cabecalho = Buffer.alloc(46);
  cabecalho.write("PK\x01\x02", 0, "latin1");
  cabecalho.writeUInt32LE(tamanhoDescompactado, 24);
  cabecalho.writeUInt16LE(nomeBuf.length, 28);
  return Buffer.concat([cabecalho, nomeBuf]);
}

/** ZIP mínimo: começa como ZIP, tem diretório central e EOCD válidos — sem dados comprimidos reais, que o detector nunca lê. */
function construirZip(nomes: string[], opcoes: { entradasDeclaradas?: number; tamanhoDescompactado?: number } = {}): Buffer {
  const entradas = nomes.map((n) => cabecalhoCentral(n, opcoes.tamanhoDescompactado ?? 0));
  const central = Buffer.concat(entradas);
  const inicioLocal = Buffer.from("PK\x03\x04", "latin1");
  const offsetCentral = inicioLocal.length;
  const eocd = Buffer.alloc(22);
  eocd.write("PK\x05\x06", 0, "latin1");
  eocd.writeUInt16LE(opcoes.entradasDeclaradas ?? nomes.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offsetCentral, 16);
  return Buffer.concat([inicioLocal, central, eocd]);
}

describe("detectarTipo", () => {
  it("aceita PDF, JPEG e PNG pela assinatura", () => {
    expect(detectarTipo(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]))).toEqual({ status: "aceito", tipo: "application/pdf" });
    expect(detectarTipo(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toEqual({ status: "aceito", tipo: "image/jpeg" });
    expect(detectarTipo(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({ status: "aceito", tipo: "image/png" });
  });

  it("recusa um arquivo sem nenhuma assinatura conhecida (tipo não permitido)", () => {
    expect(detectarTipo(Buffer.from("isto não é nada disso", "utf8"))).toEqual({ status: "tipo_nao_permitido" });
    expect(detectarTipo(Buffer.alloc(0))).toEqual({ status: "tipo_nao_permitido" });
  });

  it("reconhece um .docx mínimo pela estrutura OOXML", () => {
    const docx = construirZip(["[Content_Types].xml", "word/document.xml"]);
    expect(detectarTipo(docx)).toEqual({
      status: "aceito",
      tipo: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  });

  it("reconhece um .xlsx mínimo pela estrutura OOXML", () => {
    const xlsx = construirZip(["[Content_Types].xml", "xl/workbook.xml"]);
    expect(detectarTipo(xlsx)).toEqual({
      status: "aceito",
      tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  });

  it("um ZIP válido que não é um Office reconhecível é tipo não permitido, não arquivo recusado", () => {
    const zipGenerico = construirZip(["leia-me.txt", "dados.csv"]);
    expect(detectarTipo(zipGenerico)).toEqual({ status: "tipo_nao_permitido" });
  });

  it("um ZIP sem o [Content_Types].xml (mas com o marca-texto do Word) também não é Office válido", () => {
    const zip = construirZip(["word/document.xml"]);
    expect(detectarTipo(zip)).toEqual({ status: "tipo_nao_permitido" });
  });

  it("um ZIP com o diretório central truncado é arquivo recusado, não tipo não permitido", () => {
    // Declara 5 entradas no EOCD, mas só escreve 1: o passeio pelo diretório sai do buffer.
    const zip = construirZip(["[Content_Types].xml"], { entradasDeclaradas: 5 });
    expect(detectarTipo(zip)).toEqual({ status: "arquivo_recusado" });
  });

  it("um ZIP com mais entradas do que o teto de segurança é arquivo recusado", () => {
    const zip = construirZip(["[Content_Types].xml", "word/document.xml"], { entradasDeclaradas: 2001 });
    expect(detectarTipo(zip)).toEqual({ status: "arquivo_recusado" });
  });

  it("um ZIP cujo tamanho descompactado declarado excede o teto é arquivo recusado (defesa contra zip bomb)", () => {
    const zip = construirZip(["[Content_Types].xml", "word/document.xml"], { tamanhoDescompactado: 250 * 1024 * 1024 });
    expect(detectarTipo(zip)).toEqual({ status: "arquivo_recusado" });
  });

  it("um ZIP vazio demais para ter um EOCD de verdade é tipo não permitido", () => {
    expect(detectarTipo(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toEqual({ status: "tipo_nao_permitido" });
  });
});
