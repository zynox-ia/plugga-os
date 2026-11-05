import { describe, expect, it } from "vitest";

import { cabecalhoDisposicao, nomeSeguro } from "./lead-documentos.rules";

describe("nomeSeguro", () => {
  it("troca espaço e acento por sublinhado, sem trocar a extensão", () => {
    expect(nomeSeguro("Conta de energia (outubro).pdf")).toBe("Conta_de_energia_outubro_.pdf");
  });

  it("descarta qualquer caminho de diretório embutido no nome, ficando só com o último segmento", () => {
    expect(nomeSeguro("../../etc/passwd")).toBe("passwd");
    expect(nomeSeguro("C:\\Users\\nome\\documento.docx")).toBe("documento.docx");
  });

  it("remove caractere de controle sem travar", () => {
    expect(nomeSeguro("arquivo\u0000\u0007.pdf")).toBe("arquivo.pdf");
  });

  it("nunca devolve vazio", () => {
    expect(nomeSeguro("")).toBe("arquivo");
    expect(nomeSeguro("***")).toBe("arquivo");
  });

  it("limita o tamanho", () => {
    expect(nomeSeguro(`${"a".repeat(300)}.pdf`).length).toBeLessThanOrEqual(150);
  });
});

describe("cabecalhoDisposicao", () => {
  it("usa o tipo pedido e carrega o nome real em filename*", () => {
    const cabecalho = cabecalhoDisposicao("attachment", "Proposta Setembro.pdf");
    expect(cabecalho).toBe('attachment; filename="Proposta Setembro.pdf"; filename*=UTF-8\'\'Proposta%20Setembro.pdf');
  });

  it("nunca deixa aspas vazarem para o filename em ASCII", () => {
    const cabecalho = cabecalhoDisposicao("inline", 'nome "malicioso".pdf');
    expect(cabecalho).not.toContain('filename="nome "malicioso".pdf"');
    expect(cabecalho).toContain('filename="nome malicioso.pdf"');
  });

  it("troca acento e caractere fora do ASCII pelo substituto, mas preserva no filename*", () => {
    const cabecalho = cabecalhoDisposicao("attachment", "conta_de_energia_março.pdf");
    expect(cabecalho).toContain('filename="conta_de_energia_mar_o.pdf"');
    expect(cabecalho).toContain("filename*=UTF-8''conta_de_energia_mar%C3%A7o.pdf");
  });
});
