import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  avisoDeCorpusAusente,
  baixarCorpus,
  configuracaoDoCorpus,
  CorpusMalConfiguradoError,
  fixtureDoCorpus,
  fixturesLocais,
  pastaDoCorpus,
  publicarCorpus,
  type BaldeDoCorpus,
} from "./corpus.js";

/**
 * O corpus, provado sem MinIO no ar.
 *
 * O que interessa aqui não é falar S3 — isso o SDK faz — e sim as decisões que
 * cercam a conversa: recusar configuração que mistura o balde de teste com o de
 * produção, não deixar uma chave vinda do balde escolher onde o download
 * escreve, e pular em vez de falhar quando não há credencial.
 */

function baldeDeMentira(objetos: Record<string, string> = {}): BaldeDoCorpus & {
  enviados: Record<string, string>;
} {
  const enviados: Record<string, string> = {};

  return {
    enviados,
    listar: () => Promise.resolve(Object.keys(objetos)),
    baixar: (chave) => {
      const conteudo = objetos[chave];
      if (conteudo === undefined) throw new Error(`sem ${chave}`);
      return Promise.resolve(Buffer.from(conteudo));
    },
    enviar: (chave, conteudo) => {
      enviados[chave] = conteudo.toString("utf8");
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

let pasta: string;

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), "plugga-corpus-"));
});

afterEach(() => {
  rmSync(pasta, { recursive: true, force: true });
});

describe("configuração do corpus", () => {
  it("é nula sem credencial, que é o caso de quem clona sem acesso", () => {
    expect(configuracaoDoCorpus({ STORAGE_ENDPOINT: "http://minio:9000" })).toBeNull();
    expect(
      configuracaoDoCorpus({ CORPUS_ACCESS_KEY: "leitor", STORAGE_ENDPOINT: "http://minio:9000" }),
    ).toBeNull();
  });

  it("herda o servidor do armazenamento, mas nunca a credencial dele", () => {
    const configuracao = configuracaoDoCorpus({
      STORAGE_ENDPOINT: "http://minio:9000",
      STORAGE_REGION: "sa-east-1",
      STORAGE_ACCESS_KEY: "producao",
      STORAGE_SECRET_KEY: "producao-secreta",
      CORPUS_ACCESS_KEY: "leitor",
      CORPUS_SECRET_KEY: "leitor-secreta",
    });

    // É o mesmo MinIO, então o endereço se herda; a chave do corpus é separada
    // e somente-leitura na CI, então herdar a de produção daria ao runner um
    // poder que ele não precisa ter.
    expect(configuracao).toEqual({
      endpoint: "http://minio:9000",
      regiao: "sa-east-1",
      balde: "plugga-corpus-faturas",
      accessKey: "leitor",
      secretKey: "leitor-secreta",
    });
  });

  it("recusa o corpus e a produção no mesmo balde", () => {
    expect(() =>
      configuracaoDoCorpus({
        STORAGE_ENDPOINT: "http://minio:9000",
        STORAGE_BUCKET: "plugga-faturas",
        CORPUS_BUCKET: "plugga-faturas",
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
  it("sobe a fixture com o nome do arquivo como chave", async () => {
    const caminho = join(pasta, "usina-teste-2026-01.pagina.json");
    writeFileSync(caminho, PAGINA);

    const balde = baldeDeMentira();
    const publicacao = await publicarCorpus(balde, [caminho]);

    expect(publicacao.publicados).toEqual(["usina-teste-2026-01.pagina.json"]);
    expect(publicacao.recusados).toEqual([]);
    expect(balde.enviados["usina-teste-2026-01.pagina.json"]).toBe(PAGINA);
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
});

describe("baixar o corpus", () => {
  it("escreve as fixtures na pasta local", async () => {
    const balde = baldeDeMentira({ "usina-teste-2026-01.pagina.json": PAGINA });
    const download = await baixarCorpus(balde, join(pasta, "corpus"));

    expect(download.baixados).toEqual(["usina-teste-2026-01.pagina.json"]);
    expect(readFileSync(join(pasta, "corpus", "usina-teste-2026-01.pagina.json"), "utf8")).toBe(
      PAGINA,
    );
  });

  it("não deixa a chave do balde escolher onde escrever", async () => {
    const balde = baldeDeMentira({
      "../fora-do-corpus.pagina.json": PAGINA,
      "subpasta/usina-teste-2026-01.pagina.json": PAGINA,
      "notas.txt": "qualquer coisa",
    });

    const destino = join(pasta, "corpus");
    const download = await baixarCorpus(balde, destino);

    expect(download.baixados).toEqual([]);
    expect(download.ignorados).toHaveLength(3);
    // Quem escreve no balde não escolhe onde este comando escreve no disco.
    expect(existsSync(join(pasta, "fora-do-corpus.pagina.json"))).toBe(false);
    expect(existsSync(join(destino, "notas.txt"))).toBe(false);
  });
});

describe("ler o corpus local", () => {
  it("devolve nulo quando a fixture não foi baixada", () => {
    expect(fixtureDoCorpus("usina-teste-2026-01.pagina.json", pasta)).toBeNull();
    expect(fixturesLocais(pasta)).toEqual([]);
    expect(fixturesLocais(join(pasta, "nem-existe"))).toEqual([]);
  });

  it("lê a fixture baixada como documento normalizado", () => {
    writeFileSync(join(pasta, "usina-teste-2026-01.pagina.json"), PAGINA);

    expect(fixtureDoCorpus("usina-teste-2026-01.pagina.json", pasta)?.origem).toBe("texto_direto");
    expect(fixturesLocais(pasta)).toEqual(["usina-teste-2026-01.pagina.json"]);
  });

  it("o aviso diz o comando e diz que pular não é falha", () => {
    const aviso = avisoDeCorpusAusente("usina-teste-2026-01.pagina.json", pasta);

    expect(aviso).toContain("corpus:baixar");
    expect(aviso).toContain("CORPUS_ACCESS_KEY");
    expect(aviso).toContain("não é falha");
  });
});
