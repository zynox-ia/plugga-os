import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  arquivosLocais,
  avisoDeCorpusAusente,
  baixarCorpus,
  configuracaoDoCorpus,
  CorpusMalConfiguradoError,
  fixtureDoCorpus,
  fixturesLocais,
  pastaDoCorpus,
  pdfDoCorpus,
  pdfsLocais,
  publicarCorpus,
  type BaldeDoCorpus,
  type TipoDeConteudoDoCorpus,
} from "./corpus.js";

/**
 * O corpus, provado sem armazenamento no ar.
 *
 * O que interessa aqui não é falar S3 — isso o SDK faz — e sim as decisões que
 * cercam a conversa: recusar configuração que mistura o balde de teste com o de
 * produção, não deixar uma chave vinda do balde escolher onde o download
 * escreve, e pular em vez de falhar quando não há credencial.
 */

function baldeDeMentira(objetos: Record<string, string> = {}): BaldeDoCorpus & {
  enviados: Record<string, string>;
  tipos: Record<string, TipoDeConteudoDoCorpus>;
} {
  const enviados: Record<string, string> = {};
  const tipos: Record<string, TipoDeConteudoDoCorpus> = {};

  return {
    enviados,
    tipos,
    listar: () => Promise.resolve(Object.keys(objetos)),
    baixar: (chave) => {
      const conteudo = objetos[chave];
      if (conteudo === undefined) throw new Error(`sem ${chave}`);
      return Promise.resolve(Buffer.from(conteudo));
    },
    enviar: (chave, conteudo, tipoConteudo) => {
      enviados[chave] = conteudo.toString("utf8");
      tipos[chave] = tipoConteudo;
      return Promise.resolve();
    },
  };
}

const PAGINA = JSON.stringify({
  origem: "texto_direto",
  totalDePaginas: 1,
  confianca: null,
  paginas: [{ numero: 1, largura: 10, altura: 10, fragmentos: [] }],
});
const PDF = "%PDF-1.7\n% corpus de teste";

let pasta: string;

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), "plugga-corpus-"));
});

afterEach(() => {
  rmSync(pasta, { recursive: true, force: true });
});

describe("configuração do corpus", () => {
  it("é nula sem credencial, que é o caso de quem clona sem acesso", () => {
    expect(configuracaoDoCorpus({ STORAGE_ENDPOINT: "http://seaweedfs:8333" })).toBeNull();
    expect(
      configuracaoDoCorpus({ CORPUS_ACCESS_KEY: "leitor", STORAGE_ENDPOINT: "http://seaweedfs:8333" }),
    ).toBeNull();
  });

  it("herda o servidor do armazenamento, mas nunca a credencial dele", () => {
    const configuracao = configuracaoDoCorpus({
      STORAGE_ENDPOINT: "http://seaweedfs:8333",
      STORAGE_REGION: "sa-east-1",
      STORAGE_ACCESS_KEY: "producao",
      STORAGE_SECRET_KEY: "producao-secreta",
      CORPUS_ACCESS_KEY: "leitor",
      CORPUS_SECRET_KEY: "leitor-secreta",
    });

    // É o mesmo armazenamento, então o endereço se herda; a chave do corpus é separada
    // e somente-leitura na CI, então herdar a de produção daria ao runner um
    // poder que ele não precisa ter.
    expect(configuracao).toEqual({
      endpoint: "http://seaweedfs:8333",
      regiao: "sa-east-1",
      balde: "plugga-corpus-faturas",
      accessKey: "leitor",
      secretKey: "leitor-secreta",
    });
  });

  it("recusa o corpus dentro de um balde de negócio", () => {
    expect(() =>
      configuracaoDoCorpus({
        STORAGE_ENDPOINT: "http://seaweedfs:8333",
        CORPUS_BUCKET: "plugga-energia-opm",
        CORPUS_ACCESS_KEY: "leitor",
        CORPUS_SECRET_KEY: "leitor-secreta",
      }),
    ).toThrow(CorpusMalConfiguradoError);
  });

  it("a pasta local não depende de onde o comando foi chamado", () => {
    expect(pastaDoCorpus({})).toBe(resolve(__dirname, "../../../test/corpus"));
    expect(pastaDoCorpus({ CORPUS_LOCAL: pasta })).toBe(pasta);
  });
});

describe("publicar o corpus", () => {
  it("sobe página e PDF com o nome como chave e o MIME correto", async () => {
    const pagina = join(pasta, "usina-teste-2026-01.pagina.json");
    const pdf = join(pasta, "usina-teste-2026-01.pdf");
    writeFileSync(pagina, PAGINA);
    writeFileSync(pdf, PDF);

    const balde = baldeDeMentira();
    const publicacao = await publicarCorpus(balde, [pagina, pdf]);

    expect(publicacao.publicados).toEqual([
      "usina-teste-2026-01.pagina.json",
      "usina-teste-2026-01.pdf",
    ]);
    expect(publicacao.recusados).toEqual([]);
    expect(balde.enviados["usina-teste-2026-01.pagina.json"]).toBe(PAGINA);
    expect(balde.enviados["usina-teste-2026-01.pdf"]).toBe(PDF);
    expect(balde.tipos).toEqual({
      "usina-teste-2026-01.pagina.json": "application/json",
      "usina-teste-2026-01.pdf": "application/pdf",
    });
  });

  it("recusa nome fora do padrão, arquivo ausente e JSON quebrado — dizendo qual", async () => {
    const foraDoPadrao = join(pasta, "Usina Teste.json");
    writeFileSync(foraDoPadrao, PAGINA);

    const quebrado = join(pasta, "quebrada-2026-01.pagina.json");
    writeFileSync(quebrado, "{ isto não é json");

    const ausente = join(pasta, "sumida-2026-01.pagina.json");

    const balde = baldeDeMentira();
    const publicacao = await publicarCorpus(balde, [foraDoPadrao, quebrado, ausente]);

    expect(publicacao.publicados).toEqual([]);
    expect(publicacao.recusados.map((r) => r.caminho)).toEqual([foraDoPadrao, quebrado, ausente]);
    // Um JSON quebrado no balde só apareceria como teste vermelho meses depois,
    // em quem baixou.
    expect(publicacao.recusados[1]?.motivo).toMatch(/JSON/);
    expect(balde.enviados).toEqual({});
  });

  it("recusa arquivo com extensão PDF cujo conteúdo não é PDF", async () => {
    const falsoPdf = join(pasta, "usina-teste-2026-01.pdf");
    writeFileSync(falsoPdf, "isto não é um PDF");

    const balde = baldeDeMentira();
    const publicacao = await publicarCorpus(balde, [falsoPdf]);

    expect(publicacao.publicados).toEqual([]);
    expect(publicacao.recusados[0]?.motivo).toMatch(/cabeçalho de PDF/);
    expect(balde.enviados).toEqual({});
  });
});

describe("baixar o corpus", () => {
  it("escreve página e PDF na pasta local", async () => {
    const balde = baldeDeMentira({
      "usina-teste-2026-01.pagina.json": PAGINA,
      "usina-teste-2026-01.pdf": PDF,
    });
    const download = await baixarCorpus(balde, join(pasta, "corpus"));

    expect(download.baixados).toEqual([
      "usina-teste-2026-01.pagina.json",
      "usina-teste-2026-01.pdf",
    ]);
    expect(readFileSync(join(pasta, "corpus", "usina-teste-2026-01.pagina.json"), "utf8")).toBe(
      PAGINA,
    );
    expect(readFileSync(join(pasta, "corpus", "usina-teste-2026-01.pdf"), "utf8")).toBe(PDF);
  });

  it("não deixa a chave do balde escolher onde escrever", async () => {
    const balde = baldeDeMentira({
      "../fora-do-corpus.pagina.json": PAGINA,
      "../fora-do-corpus.pdf": PDF,
      "subpasta/usina-teste-2026-01.pagina.json": PAGINA,
      "subpasta/usina-teste-2026-01.pdf": PDF,
      "notas.txt": "qualquer coisa",
    });

    const destino = join(pasta, "corpus");
    const download = await baixarCorpus(balde, destino);

    expect(download.baixados).toEqual([]);
    expect(download.ignorados).toHaveLength(5);
    // Quem escreve no balde não escolhe onde este comando escreve no disco.
    expect(existsSync(join(pasta, "fora-do-corpus.pagina.json"))).toBe(false);
    expect(existsSync(join(pasta, "fora-do-corpus.pdf"))).toBe(false);
    expect(existsSync(join(destino, "notas.txt"))).toBe(false);
  });
});

describe("ler o corpus local", () => {
  it("devolve nulo quando a fixture não foi baixada", () => {
    expect(fixtureDoCorpus("usina-teste-2026-01.pagina.json", pasta)).toBeNull();
    expect(pdfDoCorpus("usina-teste-2026-01.pdf", pasta)).toBeNull();
    expect(arquivosLocais(pasta)).toEqual([]);
    expect(fixturesLocais(pasta)).toEqual([]);
    expect(pdfsLocais(pasta)).toEqual([]);
    expect(fixturesLocais(join(pasta, "nem-existe"))).toEqual([]);
  });

  it("lê e lista a página e o PDF sem misturar os dois contratos", () => {
    writeFileSync(join(pasta, "usina-teste-2026-01.pagina.json"), PAGINA);
    writeFileSync(join(pasta, "usina-teste-2026-01.pdf"), PDF);

    expect(fixtureDoCorpus("usina-teste-2026-01.pagina.json", pasta)?.origem).toBe("texto_direto");
    expect(pdfDoCorpus("usina-teste-2026-01.pdf", pasta)?.toString("utf8")).toBe(PDF);
    expect(arquivosLocais(pasta)).toEqual([
      "usina-teste-2026-01.pagina.json",
      "usina-teste-2026-01.pdf",
    ]);
    expect(fixturesLocais(pasta)).toEqual(["usina-teste-2026-01.pagina.json"]);
    expect(pdfsLocais(pasta)).toEqual(["usina-teste-2026-01.pdf"]);
  });

  it("restaura como nula a confiança ausente nas páginas congeladas antigas", () => {
    const paginaLegada = JSON.stringify({
      origem: "texto_direto",
      totalDePaginas: 1,
      paginas: [{ numero: 1, largura: 10, altura: 10, fragmentos: [] }],
    });
    writeFileSync(join(pasta, "usina-legada-2026-01.pagina.json"), paginaLegada);

    const documento = fixtureDoCorpus("usina-legada-2026-01.pagina.json", pasta);

    expect(documento?.confianca).toBeNull();
    expect(documento).toHaveProperty("confianca");
  });

  it("o aviso diz o comando e diz que pular não é falha", () => {
    const aviso = avisoDeCorpusAusente("usina-teste-2026-01.pagina.json", pasta);

    expect(aviso).toContain("corpus:baixar");
    expect(aviso).toContain("CORPUS_ACCESS_KEY");
    expect(aviso).toContain("não é falha");
  });
});
