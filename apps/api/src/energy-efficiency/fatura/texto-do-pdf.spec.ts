import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { extrairTexto } from "./texto-do-pdf.js";

/**
 * PDFs sintéticos: o que se testa aqui é a decodificação, não a conformidade
 * com a especificação. Um arquivo real de fatura tem dado de cliente e não
 * entra no repositório — a cobertura contra os arquivos de verdade está em
 * `test/fatura-corpus.integration.spec.ts`, apontando para uma pasta local.
 */
function pdfComConteudo(conteudo: string): Buffer {
  return Buffer.concat([
    Buffer.from("%PDF-1.7\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n", "latin1"),
    deflateSync(Buffer.from(conteudo, "latin1")),
    Buffer.from("\nendstream\nendobj\n", "latin1"),
  ]);
}

/** Escreve o texto como a fonte com subconjunto faz: dois bytes por glifo. */
function comFonteCodificada(texto: string, deslocamento: number): string {
  const bytes = [...texto]
    .map((c) => {
      const codigo = c.charCodeAt(0) - deslocamento;
      return `\\${(codigo >> 8).toString(8).padStart(3, "0")}\\${(codigo & 0xff).toString(8).padStart(3, "0")}`;
    })
    .join("");
  return `BT (${bytes}) Tj ET`;
}

const LINHAS_DE_FATURA = [
  "Consumo Ponta 21.231 kWh a 0,697040",
  "Demanda 965 kW a 42,600000",
  "Energia Eletrica - Leitura anterior",
  "Vencimento 07/05/2026",
].join(" ");

describe("texto do PDF da fatura", () => {
  it("lê fatura cuja fonte já entrega caracteres", () => {
    const texto = extrairTexto(pdfComConteudo(`BT (${LINHAS_DE_FATURA}) Tj ET`));

    expect(texto.origem).toBe("texto_direto");
    expect(texto.deslocamento).toBeNull();
    expect(texto.linhas.join(" ")).toContain("Consumo Ponta 21.231 kWh");
  });

  it("descobre sozinho o deslocamento da fonte com subconjunto", () => {
    const texto = extrairTexto(pdfComConteudo(comFonteCodificada(LINHAS_DE_FATURA, 29)));

    expect(texto.origem).toBe("fonte_codificada");
    expect(texto.deslocamento).toBe(29);
    expect(texto.linhas.join(" ")).toContain("Consumo Ponta 21.231 kWh");
  });

  it("funciona com qualquer deslocamento, não só o das amostras", () => {
    // O +29 apareceu em todo o corpus, mas é observação e não regra: fixar o
    // valor quebraria no primeiro gerador de PDF diferente. Deslocamento
    // negativo é o caso de fonte com mais glifos que o bloco ASCII.
    for (const deslocamento of [3, 29, -435, -3_000]) {
      const texto = extrairTexto(pdfComConteudo(comFonteCodificada(LINHAS_DE_FATURA, deslocamento)));

      expect(texto.origem).toBe("fonte_codificada");
      expect(texto.deslocamento).toBe(deslocamento);
    }
  });

  it("trata PDF sem camada de texto como digitalização", () => {
    const texto = extrairTexto(pdfComConteudo("q 612 0 0 792 0 0 cm /Im0 Do Q"));

    expect(texto.origem).toBe("digitalizacao");
    expect(texto.linhas).toEqual([]);
  });

  it("recusa em vez de adivinhar quando o texto não vira vocabulário de fatura", () => {
    const ruido = "BT (" + "zqxjvk ".repeat(60) + ") Tj ET";

    expect(extrairTexto(pdfComConteudo(ruido)).origem).toBe("digitalizacao");
  });
});
