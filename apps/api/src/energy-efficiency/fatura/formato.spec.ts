import { describe, expect, it } from "vitest";

import { reconhecerFormato } from "./formato.js";

/**
 * O formato é decidido pelos primeiros bytes, e é isso que estes testes fixam.
 *
 * Vale porque o caso que motivou o módulo é justamente o do arquivo que mente:
 * foto renomeada para `.pdf`, que a extensão e o `content-type` declaram como
 * PDF e o conteúdo desmente.
 */

/** Monta um arquivo que começa com a assinatura dada. */
function arquivo(hex: string, resto = "conteudo qualquer"): Buffer {
  return Buffer.concat([Buffer.from(hex, "hex"), Buffer.from(resto, "latin1")]);
}

describe("reconhecerFormato", () => {
  it("reconhece PDF pela assinatura", () => {
    expect(reconhecerFormato(Buffer.from("%PDF-1.7\n..."))).toEqual({ tipo: "pdf" });
  });

  it("reconhece as imagens que a pilha sabe abrir", () => {
    expect(reconhecerFormato(arquivo("ffd8ffe0"))).toEqual({ tipo: "imagem", mime: "image/jpeg" });
    expect(reconhecerFormato(arquivo("89504e470d0a1a0a"))).toEqual({
      tipo: "imagem",
      mime: "image/png",
    });
    expect(reconhecerFormato(arquivo("47494638"))).toEqual({ tipo: "imagem", mime: "image/gif" });
    expect(reconhecerFormato(arquivo("49492a00"))).toEqual({ tipo: "imagem", mime: "image/tiff" });
    expect(reconhecerFormato(arquivo("4d4d002a"))).toEqual({ tipo: "imagem", mime: "image/tiff" });
    expect(reconhecerFormato(arquivo("424d"))).toEqual({ tipo: "imagem", mime: "image/bmp" });
  });

  it("distingue WebP de outros contêineres RIFF", () => {
    const webp = Buffer.concat([
      Buffer.from("RIFF", "latin1"),
      Buffer.from("2c000000", "hex"),
      Buffer.from("WEBPVP8 ", "latin1"),
    ]);
    const wave = Buffer.concat([
      Buffer.from("RIFF", "latin1"),
      Buffer.from("2c000000", "hex"),
      Buffer.from("WAVEfmt ", "latin1"),
    ]);

    expect(reconhecerFormato(webp)).toEqual({ tipo: "imagem", mime: "image/webp" });
    // Sem olhar a marca de dentro, um áudio entraria como imagem e só falharia
    // lá na frente, no decodificador, com uma mensagem que não ajuda ninguém.
    expect(reconhecerFormato(wave).tipo).toBe("nao_suportado");
  });

  it("separa a foto do iPhone dos formatos que não são imagem", () => {
    const heic = Buffer.concat([
      Buffer.from("00000018", "hex"),
      Buffer.from("ftypheic", "latin1"),
    ]);

    // HEIC é imagem de verdade e a pessoa precisa saber disso para converter;
    // dizer "formato que não reconheço" mandaria procurar o problema no lugar
    // errado.
    expect(reconhecerFormato(heic)).toEqual({
      tipo: "imagem_nao_suportada",
      nome: "uma foto HEIC do iPhone",
    });
  });

  it("nomeia o que veio quando não é fatura nenhuma", () => {
    expect(reconhecerFormato(arquivo("504b0304"))).toEqual({
      tipo: "nao_suportado",
      nome: "um arquivo ZIP (talvez .docx ou .xlsx)",
    });
    expect(reconhecerFormato(arquivo("d0cf11e0a1b11ae1"))).toEqual({
      tipo: "nao_suportado",
      nome: "um documento antigo do Office",
    });
  });

  it("não se deixa enganar pela extensão", () => {
    // O caso real: 18 das 73 faturas do CRM são foto salva com nome `.pdf`.
    const fotoComNomeDePdf = arquivo("ffd8ffe0");
    expect(reconhecerFormato(fotoComNomeDePdf)).toEqual({ tipo: "imagem", mime: "image/jpeg" });
  });

  it("aguenta arquivo curto demais para ter assinatura", () => {
    expect(reconhecerFormato(Buffer.alloc(0)).tipo).toBe("nao_suportado");
    expect(reconhecerFormato(Buffer.from("ab", "latin1")).tipo).toBe("nao_suportado");
  });
});
