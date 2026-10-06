import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Logger, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { CriarPedidoRequest, PedidoDetalhe } from "@plugga/shared";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import {
  executavel,
  jpeg,
  MIME,
  pdf,
  pdfComFluxoDeObjetos,
  png,
  xlsx,
} from "../src/common/upload/arquivos-de-teste";
import { LimitadorDeUploads } from "../src/common/upload/limitador-de-uploads";
import { PASTA_BASE } from "../src/common/upload/upload-em-disco";
import { ArmazenamentoDeCotacoes } from "../src/compras/armazenamento-de-cotacoes";
import { ComprasEscopoRepository } from "../src/compras/compras-escopo.repository";
import { ComprasRepository } from "../src/compras/compras.repository";
import { ArmazenamentoDeEvidencias } from "../src/obras/armazenamento-de-evidencias";
import { ObrasEscopoRepository } from "../src/obras/obras-escopo.repository";
import { ObrasRepository } from "../src/obras/obras.repository";

/**
 * US10 / SC-012: entradas pesadas ou hostis são recusadas em segundos, sem
 * crescer a memória do processo e sem atrapalhar quem envia arquivo legítimo.
 * Repositórios em memória: o que se exercita é HTTP + upload em disco +
 * inspeção de conteúdo, sem Postgres.
 */

const OBRA_ID = "00000000-0000-4000-8000-000000000102";
const FORNECEDOR_ID = "00000000-0000-4000-8000-000000000101";
const RESPONSAVEL_ID = "00000000-0000-4000-8000-000000000201";

const LIMITE_DE_TEMPO_MS = 3000;
const LIMITE_DE_MEMORIA = 100 * 1024 * 1024;

/** Só devolve o que o teste usa; qualquer outra chamada seria um erro do teste. */
function dubleDe<T extends object>(metodos: Record<string, (...args: never[]) => unknown>): T {
  return new Proxy({} as T, {
    get: (_alvo, nome) => (typeof nome === "string" ? metodos[nome] : undefined),
  });
}

const comprasFalso = dubleDe<ComprasRepository>({
  criarPedido: async () => ({ id: "00000000-0000-4000-8000-900000000001", etapa: "pedido_gerado" }),
});
const escopoComprasFalso = dubleDe<ComprasEscopoRepository>({
  alcanca: async () => true,
  assertAlcanca: async () => undefined,
});
const obrasFalso = dubleDe<ObrasRepository>({
  registrarEvidencia: async () => ({ id: OBRA_ID }),
});
const escopoObrasFalso = dubleDe<ObrasEscopoRepository>({
  alcanca: async () => true,
  assertAlcanca: async () => undefined,
});

class ArmazenamentoFalso extends ArmazenamentoDeCotacoes {
  guardados = 0;
  override async guardar(_c: Buffer, _m: string, nome: string): Promise<{ chave: string }> {
    this.guardados += 1;
    return { chave: `cotacoes/teste/${nome}` };
  }
}

const payload = (): string =>
  JSON.stringify({
    companyId: "plugga",
    titulo: "Cabos para a obra",
    itens: [{ descricao: "Cabo 10mm", quantidade: "150.000", unidade: "m" }],
    destino: "obra",
    obraId: OBRA_ID,
    responsavelId: RESPONSAVEL_ID,
    prazoEntregaDesejado: "2026-09-01T12:00:00.000Z",
    valorOrcado: "5000.00",
    cotacoes: [{ fornecedorId: FORNECEDOR_ID, valor: "4800.00", prazoEntregaDias: 12 }],
  } satisfies CriarPedidoRequest);

describe("limites de entrada — US10 (e2e)", () => {
  let app: INestApplication;
  let armazenamento: ArmazenamentoFalso;
  let pastaTemporaria: string;
  let tmpOriginal: string | undefined;

  beforeAll(async () => {
    // Pasta temporária própria: permite afirmar que nada sobra depois das requisições.
    tmpOriginal = process.env.TMPDIR;
    pastaTemporaria = await mkdtemp(join(tmpdir(), "limites-entrada-"));
    process.env.TMPDIR = pastaTemporaria;

    armazenamento = new ArmazenamentoFalso();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ComprasRepository)
      .useValue(comprasFalso)
      .overrideProvider(ComprasEscopoRepository)
      .useValue(escopoComprasFalso)
      .overrideProvider(ArmazenamentoDeCotacoes)
      .useValue(armazenamento)
      .overrideProvider(ArmazenamentoDeEvidencias)
      .useValue({ guardar: async () => ({ chave: "evidencias-de-obra/teste/campo.png" }) })
      .overrideProvider(ObrasRepository)
      .useValue(obrasFalso)
      .overrideProvider(ObrasEscopoRepository)
      .useValue(escopoObrasFalso)
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (tmpOriginal === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = tmpOriginal;
    await rm(pastaTemporaria, { recursive: true, force: true });
  });

  beforeEach(() => {
    armazenamento.guardados = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const como = (id: string, roles: string) => ({
    post: (caminho: string) =>
      request(app.getHttpServer()).post(caminho).set("x-dev-principal", id).set("x-dev-roles", roles),
    get: (caminho: string) =>
      request(app.getHttpServer()).get(caminho).set("x-dev-principal", id).set("x-dev-roles", roles),
  });

  const enviarCotacao = (quem: string, arquivo: Buffer, nome: string, tipo: string) =>
    como(quem, "opm")
      .post("/compras/pedidos")
      .field("payload", payload())
      .attach("cotacoes", arquivo, { filename: nome, contentType: tipo });

  const enviarEvidencia = (quem: string, arquivo: Buffer, nome: string, tipo: string) =>
    como(quem, "tecnico")
      .post(`/obras/${OBRA_ID}/evidencias`)
      .field("payload", JSON.stringify({ companyId: "waze", tipo: "pdf", descricao: "Quadro instalado" }))
      .attach("arquivo", arquivo, { filename: nome, contentType: tipo });

  /** Espera o `close` da resposta apagar as pastas temporárias. */
  async function temporariosRestantes(): Promise<string[]> {
    const base = join(pastaTemporaria, PASTA_BASE);
    for (let i = 0; i < 40; i += 1) {
      const restantes = await readdir(base).catch(() => [] as string[]);
      if (restantes.length === 0) return restantes;
      await new Promise((r) => setTimeout(r, 50));
    }
    return readdir(base);
  }

  const hostis: { nome: string; arquivo: () => Buffer; arquivoNome: string; tipo: string; status: number; codigo: string }[] = [
    { nome: "PDF de 1.000 páginas", arquivo: () => pdf(1000), arquivoNome: "mil.pdf", tipo: MIME.pdf, status: 422, codigo: "ARQUIVO_RECUSADO" },
    {
      nome: "PDF de 1.000 páginas em fluxo comprimido",
      arquivo: () => pdfComFluxoDeObjetos(1000),
      arquivoNome: "mil-comprimido.pdf",
      tipo: MIME.pdf,
      status: 422,
      codigo: "ARQUIVO_RECUSADO",
    },
    { nome: "página de 14.400 pt", arquivo: () => pdf(1, 14400, 14400), arquivoNome: "gigante.pdf", tipo: MIME.pdf, status: 422, codigo: "ARQUIVO_RECUSADO" },
    { nome: "PNG de bilhões de pixels", arquivo: () => png(4_000_000_000, 3_000_000_000), arquivoNome: "enorme.png", tipo: MIME.png, status: 422, codigo: "ARQUIVO_RECUSADO" },
    { nome: "executável com nome .pdf", arquivo: executavel, arquivoNome: "virus.pdf", tipo: MIME.pdf, status: 415, codigo: "TIPO_NAO_PERMITIDO" },
    { nome: "PDF cortado", arquivo: () => pdf(3).subarray(0, 100), arquivoNome: "cortado.pdf", tipo: MIME.pdf, status: 422, codigo: "ARQUIVO_RECUSADO" },
    { nome: "JPEG que se declara PDF", arquivo: () => jpeg(), arquivoNome: "foto.pdf", tipo: MIME.pdf, status: 415, codigo: "TIPO_NAO_PERMITIDO" },
    { nome: "arquivo vazio", arquivo: () => Buffer.alloc(0), arquivoNome: "vazio.pdf", tipo: MIME.pdf, status: 422, codigo: "ARQUIVO_RECUSADO" },
  ];

  describe("arquivos hostis em Compras e Obras (SC-012)", () => {
    it("recusa cada um em menos de 3 s, com o código certo, e a memória não sobe mais de 100 MB", async () => {
      const antes = process.memoryUsage().rss;

      for (const h of hostis) {
        for (const [rota, enviar] of [
          ["compras", enviarCotacao],
          ["obras", enviarEvidencia],
        ] as const) {
          const inicio = performance.now();
          const resposta = await enviar(`hostil-${rota}`, h.arquivo(), h.arquivoNome, h.tipo);
          const duracao = performance.now() - inicio;

          expect(resposta.status, `${rota}: ${h.nome}`).toBe(h.status);
          expect(resposta.body.codigo, `${rota}: ${h.nome}`).toBe(h.codigo);
          expect(resposta.body.requestId).toBeTruthy();
          expect(duracao, `${rota}: ${h.nome}`).toBeLessThan(LIMITE_DE_TEMPO_MS);
        }
      }

      expect(process.memoryUsage().rss - antes).toBeLessThan(LIMITE_DE_MEMORIA);
      expect(armazenamento.guardados).toBe(0);
    });

    it("recusa tipo fora do permitido pelo fluxo, mesmo que o conteúdo seja legítimo (XLSX em Obras)", async () => {
      const resposta = await enviarEvidencia("hostil-obras", xlsx(), "planilha.xlsx", MIME.xlsx);
      expect(resposta.status).toBe(415);
      expect(resposta.body.codigo).toBe("TIPO_NAO_PERMITIDO");
    });

    it("não deixa temporário em disco, nem de envio recusado nem de envio aceito", async () => {
      await enviarCotacao("limpeza", pdf(1000), "mil.pdf", MIME.pdf).expect(422);
      await enviarCotacao("limpeza", pdf(), "ok.pdf", MIME.pdf).expect(201);
      await enviarEvidencia("limpeza", executavel(), "virus.pdf", MIME.pdf).expect(415);
      expect(await temporariosRestantes()).toEqual([]);
    });
  });

  describe("envio legítimo continua funcionando", () => {
    it("aceita PDF válido em Compras e PNG válido em Obras", async () => {
      const cotacao = await enviarCotacao("legitimo", pdf(2), "orcamento.pdf", MIME.pdf);
      expect(cotacao.status).toBe(201);
      expect((cotacao.body as PedidoDetalhe).id).toBeTruthy();
      expect(armazenamento.guardados).toBe(1);

      const evidencia = await enviarEvidencia("legitimo", png(1024, 768), "campo.png", MIME.png);
      expect(evidencia.status).toBe(201);
    });

    it("uma requisição legítima, simultânea aos hostis, segue respondendo", async () => {
      const antes = process.memoryUsage().rss;
      // 6 hostis + 1 legítimo = 7 envios ao mesmo tempo, abaixo do teto de 8 em andamento.
      const hostisEmParalelo = hostis.slice(0, 6).map((h, i) =>
        enviarCotacao(`paralelo-${i}`, h.arquivo(), h.arquivoNome, h.tipo).then((r) => r.status),
      );
      const inicio = performance.now();
      const [legitimo, leitura, ...recusados] = await Promise.all([
        enviarCotacao("legitimo-paralelo", pdf(2), "orcamento.pdf", MIME.pdf),
        como("legitimo-paralelo", "opm").get("/health"),
        ...hostisEmParalelo,
      ]);

      expect(legitimo.status).toBe(201);
      expect(leitura.status).toBeLessThan(500);
      expect(recusados).toEqual(hostis.slice(0, 6).map((h) => h.status));
      expect(performance.now() - inicio).toBeLessThan(LIMITE_DE_TEMPO_MS);
      expect(process.memoryUsage().rss - antes).toBeLessThan(LIMITE_DE_MEMORIA);
    });
  });

  describe("limite de envios em andamento", () => {
    it("com 8 envios em andamento, o próximo recebe 503 SERVICO_INDISPONIVEL e os que terminam liberam vaga", async () => {
      const limitador = app.get(LimitadorDeUploads);
      const liberar = Array.from({ length: 8 }, (_, i) => limitador.adquirir(`ocupado-${i}`));
      try {
        const resposta = await enviarCotacao("novo", pdf(), "ok.pdf", MIME.pdf);
        expect(resposta.status).toBe(503);
        expect(resposta.body.codigo).toBe("SERVICO_INDISPONIVEL");
        expect(String(resposta.body.mensagem).toLowerCase()).toContain("tente novamente");
      } finally {
        liberar.forEach((l) => l());
      }
      await enviarCotacao("novo", pdf(), "ok.pdf", MIME.pdf).expect(201);
    });

    it("a mesma pessoa só tem 2 envios em andamento; outra pessoa não é afetada", async () => {
      const limitador = app.get(LimitadorDeUploads);
      const liberar = [limitador.adquirir("ana"), limitador.adquirir("ana")];
      try {
        const ana = await enviarCotacao("ana", pdf(), "ok.pdf", MIME.pdf);
        expect(ana.status).toBe(429);
        expect(ana.body.codigo).toBe("MUITAS_TENTATIVAS");
        await enviarCotacao("bia", pdf(), "ok.pdf", MIME.pdf).expect(201);
      } finally {
        liberar.forEach((l) => l());
      }
      await enviarCotacao("ana", pdf(), "ok.pdf", MIME.pdf).expect(201);
    });

    it("devolve a vaga ao fim de cada requisição, inclusive as recusadas", async () => {
      const limitador = app.get(LimitadorDeUploads);
      await enviarCotacao("vaga", pdf(1000), "mil.pdf", MIME.pdf).expect(422);
      await enviarCotacao("vaga", pdf(), "ok.pdf", MIME.pdf).expect(201);
      await vi.waitFor(() => expect(limitador.emAndamento).toBe(0));
    });
  });

  describe("tamanho", () => {
    it("recusa arquivo de mais de 25 MB com 413 ARQUIVO_GRANDE_DEMAIS", async () => {
      const grande = Buffer.concat([pdf(), Buffer.alloc(26 * 1024 * 1024)]);
      const resposta = await enviarCotacao("grande", grande, "grande.pdf", MIME.pdf);
      expect(resposta.status).toBe(413);
      expect(resposta.body.codigo).toBe("ARQUIVO_GRANDE_DEMAIS");
      expect(await temporariosRestantes()).toEqual([]);
    });

    it("recusa requisição de mais de 60 MB mesmo com cada arquivo abaixo de 25 MB", async () => {
      const parte = Buffer.concat([pdf(), Buffer.alloc(20 * 1024 * 1024 + 300 * 1024)]);
      const resposta = await como("total", "opm")
        .post("/compras/pedidos")
        .field("payload", payload())
        .attach("cotacoes", parte, { filename: "a.pdf", contentType: MIME.pdf })
        .attach("cotacoes", parte, { filename: "b.pdf", contentType: MIME.pdf })
        .attach("cotacoes", parte, { filename: "c.pdf", contentType: MIME.pdf });
      expect(resposta.status).toBe(413);
      expect(resposta.body.codigo).toBe("ARQUIVO_GRANDE_DEMAIS");
      expect(await temporariosRestantes()).toEqual([]);
    });
  });

  describe("falha do armazenamento não vaza detalhe interno (T109)", () => {
    it("devolve 503 genérico e deixa o detalhe só no log, com o requestId", async () => {
      const real = new ArmazenamentoDeCotacoes();
      (real as unknown as { obterCliente: () => Promise<unknown> }).obterCliente = async () => ({
        send: async () => {
          throw new Error("connect ECONNREFUSED 10.9.8.7:9000 balde-secreto-xyz");
        },
        destroy: () => undefined,
      });
      vi.spyOn(armazenamento, "guardar").mockImplementation((c, m, n, e) => real.guardar(c, m, n, e));
      const erros = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

      const resposta = await enviarCotacao("falha", pdf(), "ok.pdf", MIME.pdf);

      expect(resposta.status).toBe(503);
      expect(resposta.body.codigo).toBe("SERVICO_INDISPONIVEL");
      const corpo = JSON.stringify(resposta.body);
      expect(corpo).not.toMatch(/ECONNREFUSED|10\.9\.8\.7|balde-secreto/);
      expect(corpo).not.toContain("não foi possível guardar");

      const requestId = resposta.body.requestId as string;
      const registro = erros.mock.calls.map((c) => String(c[0])).find((l) => l.includes("ECONNREFUSED"));
      expect(registro).toBeDefined();
      expect(registro).toContain(requestId);
    });
  });
});
