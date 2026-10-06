import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ArquivoRecusado, TipoNaoPermitido } from "../errors/dominio";
import {
  docx,
  executavel,
  jpeg,
  pdf,
  pdfComFluxoDeObjetos,
  png,
  tiff,
  webp,
  xlsx,
  zip,
} from "./arquivos-de-teste";
import { inspecionarArquivo, tiposDosMimes } from "./inspeciona-arquivo";

describe("inspecionarArquivo — arquivos legítimos", () => {
  it("aceita PDF pequeno e informa páginas e tamanho da página", async () => {
    const r = await inspecionarArquivo(pdf(3, 595, 842));
    expect(r).toMatchObject({
      tipo: "pdf",
      mime: "application/pdf",
      paginas: 3,
      larguraEmPontos: 595,
      alturaEmPontos: 842,
    });
  });

  it("conta as páginas de um PDF com fluxo de objetos comprimido", async () => {
    const r = await inspecionarArquivo(pdfComFluxoDeObjetos(4));
    expect(r.paginas).toBe(4);
  });

  it("aceita PNG, JPEG, TIFF e WebP e lê as dimensões do cabeçalho", async () => {
    expect(await inspecionarArquivo(png(800, 600))).toMatchObject({ tipo: "png", largura: 800, altura: 600 });
    expect(await inspecionarArquivo(jpeg(4032, 3024))).toMatchObject({ tipo: "jpeg", largura: 4032, altura: 3024 });
    expect(await inspecionarArquivo(tiff(1200, 900))).toMatchObject({ tipo: "tiff", largura: 1200, altura: 900 });
    expect(await inspecionarArquivo(webp(640, 480))).toMatchObject({ tipo: "webp", largura: 640, altura: 480 });
  });

  it("reconhece XLSX e DOCX pelas entradas do zip, sem descompactar", async () => {
    expect((await inspecionarArquivo(xlsx())).tipo).toBe("xlsx");
    expect((await inspecionarArquivo(docx())).tipo).toBe("docx");
  });

  it("lê de um arquivo em disco, como no upload", async () => {
    const pasta = await mkdtemp(join(tmpdir(), "inspeciona-"));
    try {
      const caminho = join(pasta, "orcamento.bin");
      await writeFile(caminho, pdf(2));
      expect((await inspecionarArquivo(caminho)).paginas).toBe(2);
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  });
});

describe("inspecionarArquivo — arquivos hostis", () => {
  it("recusa PDF de 1.000 páginas", async () => {
    await expect(inspecionarArquivo(pdf(1000))).rejects.toMatchObject({
      codigo: "ARQUIVO_RECUSADO",
      mensagemParaUsuario: expect.stringContaining("1000 páginas"),
    });
  });

  it("recusa PDF de 1.000 páginas escondidas em fluxo comprimido", async () => {
    await expect(inspecionarArquivo(pdfComFluxoDeObjetos(1000))).rejects.toBeInstanceOf(ArquivoRecusado);
  });

  it("recusa página de 14.400 pt", async () => {
    await expect(inspecionarArquivo(pdf(1, 14400, 14400))).rejects.toMatchObject({
      codigo: "ARQUIVO_RECUSADO",
      mensagemParaUsuario: expect.stringContaining("14400"),
    });
  });

  it("recusa página gigante declarada dentro de fluxo comprimido", async () => {
    await expect(inspecionarArquivo(pdfComFluxoDeObjetos(2, 14400, 842))).rejects.toBeInstanceOf(ArquivoRecusado);
  });

  it("recusa PNG que declara bilhões de pixels", async () => {
    const bilhoes = png(4_000_000_000, 3_000_000_000);
    expect(bilhoes.length).toBeLessThan(200);
    await expect(inspecionarArquivo(bilhoes)).rejects.toBeInstanceOf(ArquivoRecusado);
  });

  it("recusa imagens acima de 4.000 × 4.000 px em todos os formatos", async () => {
    await expect(inspecionarArquivo(png(8000, 8000))).rejects.toBeInstanceOf(ArquivoRecusado);
    await expect(inspecionarArquivo(jpeg(8000, 8000))).rejects.toBeInstanceOf(ArquivoRecusado);
    await expect(inspecionarArquivo(tiff(8000, 8000))).rejects.toBeInstanceOf(ArquivoRecusado);
    await expect(inspecionarArquivo(webp(16000, 16000))).rejects.toBeInstanceOf(ArquivoRecusado);
  });

  it("recusa executável com nome .pdf pelo conteúdo, e não pela extensão", async () => {
    const pasta = await mkdtemp(join(tmpdir(), "inspeciona-"));
    try {
      const caminho = join(pasta, "virus.pdf");
      await writeFile(caminho, executavel());
      await expect(inspecionarArquivo(caminho, { tiposPermitidos: ["pdf"] })).rejects.toBeInstanceOf(
        TipoNaoPermitido,
      );
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  });

  it("recusa conteúdo de tipo reconhecido mas fora dos permitidos pelo fluxo", async () => {
    await expect(inspecionarArquivo(png(), { tiposPermitidos: ["pdf"] })).rejects.toBeInstanceOf(TipoNaoPermitido);
    await expect(inspecionarArquivo(xlsx(), { tiposPermitidos: ["pdf", "png"] })).rejects.toBeInstanceOf(
      TipoNaoPermitido,
    );
  });

  it("recusa zip qualquer (que não é xlsx nem docx)", async () => {
    await expect(inspecionarArquivo(zip(["classes.dex", "AndroidManifest.xml"]))).rejects.toBeInstanceOf(
      TipoNaoPermitido,
    );
  });

  it("recusa bomba de compressão declarada no diretório do zip", async () => {
    await expect(inspecionarArquivo(xlsx(0xfffffff0))).rejects.toBeInstanceOf(ArquivoRecusado);
  });

  it("recusa arquivo vazio e texto solto", async () => {
    await expect(inspecionarArquivo(Buffer.alloc(0))).rejects.toBeInstanceOf(ArquivoRecusado);
    await expect(inspecionarArquivo(Buffer.from("olá, isto é só texto"))).rejects.toBeInstanceOf(TipoNaoPermitido);
  });

  it("recusa arquivos cortados ou corrompidos", async () => {
    const pdfCortado = pdf(3).subarray(0, 120);
    await expect(inspecionarArquivo(pdfCortado)).rejects.toBeInstanceOf(ArquivoRecusado);
    const pdfSemPaginas = Buffer.from("%PDF-1.4\n1 0 obj\n<< >>\nendobj\n%%EOF\n", "latin1");
    await expect(inspecionarArquivo(pdfSemPaginas)).rejects.toBeInstanceOf(ArquivoRecusado);

    const pngInteiro = png();
    await expect(inspecionarArquivo(pngInteiro.subarray(0, 20))).rejects.toBeInstanceOf(ArquivoRecusado);
    await expect(inspecionarArquivo(pngInteiro.subarray(0, pngInteiro.length - 12))).rejects.toBeInstanceOf(
      ArquivoRecusado,
    );

    const jpegInteiro = jpeg();
    await expect(inspecionarArquivo(jpegInteiro.subarray(0, 10))).rejects.toBeInstanceOf(ArquivoRecusado);
    await expect(inspecionarArquivo(jpegInteiro.subarray(0, jpegInteiro.length - 2))).rejects.toBeInstanceOf(
      ArquivoRecusado,
    );

    await expect(inspecionarArquivo(tiff().subarray(0, 12))).rejects.toBeInstanceOf(ArquivoRecusado);
    await expect(inspecionarArquivo(webp().subarray(0, 20))).rejects.toBeInstanceOf(ArquivoRecusado);
    await expect(inspecionarArquivo(xlsx().subarray(0, 50))).rejects.toBeInstanceOf(ArquivoRecusado);
  });

  it("permite ajustar os limites por parâmetro", async () => {
    await expect(inspecionarArquivo(pdf(5), { limites: { maxPaginasPdf: 3 } })).rejects.toBeInstanceOf(
      ArquivoRecusado,
    );
    expect((await inspecionarArquivo(pdf(5), { limites: { maxPaginasPdf: 5 } })).paginas).toBe(5);
    await expect(inspecionarArquivo(png(2000, 2000), { limites: { maxPixels: 1000 * 1000 } })).rejects.toBeInstanceOf(
      ArquivoRecusado,
    );
  });

  it("recusa 1.000 páginas em milissegundos, sem ler o arquivo todo para a memória", async () => {
    const inicio = performance.now();
    await expect(inspecionarArquivo(pdf(1000))).rejects.toBeInstanceOf(ArquivoRecusado);
    expect(performance.now() - inicio).toBeLessThan(500);
  });
});

describe("tiposDosMimes", () => {
  it("traduz os mimes de um fluxo para os tipos inspecionáveis", () => {
    expect(tiposDosMimes(["application/pdf", "image/png", "text/html"]).sort()).toEqual(["pdf", "png"]);
  });
});
