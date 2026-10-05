import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  type INestApplication,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
  HttpException,
  Query,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { codigosDeErro, erroApiSchema, statusPorCodigo, type CodigoDeErro } from "@plugga/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { AppModule } from "../src/app.module";
import { configureApp } from "../src/configure-app";
import { Conflito, EstadoInvalido, LimiteExcedido, NaoEncontrado } from "../src/common/errors/dominio";
import { FiltroGlobalDeExcecoes } from "../src/common/errors/filtro-global";
import { ZodValidationPipe } from "../src/common/zod-validation.pipe";

function prisma(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("detalhe interno do prisma em /usr/lib/x", {
    code,
    clientVersion: "test",
  });
}

/** Cada caso produz um código do catálogo; a tabela abaixo prova que todos têm pelo menos um. */
const CASOS: Record<string, { lancar: () => unknown; codigo: CodigoDeErro }> = {
  invalida: { lancar: () => new BadRequestException("campo inválido"), codigo: "REQUISICAO_INVALIDA" },
  semSessao: { lancar: () => new UnauthorizedException("authentication required"), codigo: "NAO_AUTENTICADO" },
  semPapel: { lancar: () => new ForbiddenException("forbidden role"), codigo: "ACESSO_NEGADO" },
  inexistente: { lancar: () => new NotFoundException(), codigo: "NAO_ENCONTRADO" },
  dominioInexistente: { lancar: () => new NaoEncontrado("Estudo não encontrado."), codigo: "NAO_ENCONTRADO" },
  prismaP2025: { lancar: () => prisma("P2025"), codigo: "NAO_ENCONTRADO" },
  estado: { lancar: () => new EstadoInvalido("Este estudo já foi aprovado por outra pessoa."), codigo: "CONFLITO_ESTADO" },
  prismaP2034: { lancar: () => prisma("P2034"), codigo: "CONFLITO_ESTADO" },
  unicidade: { lancar: () => new Conflito("Já existe um cliente com este documento."), codigo: "CONFLITO_UNICIDADE" },
  prismaP2002: { lancar: () => prisma("P2002"), codigo: "CONFLITO_UNICIDADE" },
  grande: { lancar: () => new PayloadTooLargeException(), codigo: "ARQUIVO_GRANDE_DEMAIS" },
  dominioGrande: { lancar: () => new LimiteExcedido("Arquivo grande demais.", "ARQUIVO_GRANDE_DEMAIS"), codigo: "ARQUIVO_GRANDE_DEMAIS" },
  tipo: { lancar: () => new UnsupportedMediaTypeException(), codigo: "TIPO_NAO_PERMITIDO" },
  recusado: { lancar: () => new UnprocessableEntityException(), codigo: "ARQUIVO_RECUSADO" },
  tentativas: { lancar: () => new HttpException("Too Many Requests", 429), codigo: "MUITAS_TENTATIVAS" },
  dominioTentativas: { lancar: () => new LimiteExcedido("Aguarde.", "MUITAS_TENTATIVAS", 30), codigo: "MUITAS_TENTATIVAS" },
  indisponivel: { lancar: () => new ServiceUnavailableException("S3 ECONNREFUSED 10.0.0.5:9000"), codigo: "SERVICO_INDISPONIVEL" },
  prismaFora: { lancar: () => prisma("P1001"), codigo: "SERVICO_INDISPONIVEL" },
  interno: { lancar: () => new Error("Prisma: connect ECONNREFUSED postgres:5432 em /app/node_modules/x.js"), codigo: "ERRO_INTERNO" },
  zod: { lancar: () => z.object({ a: z.string() }).parse({}), codigo: "REQUISICAO_INVALIDA" },
};

@Controller("teste-erro")
class ControladorDeErros {
  @Get("caso")
  caso(@Query("c") c: string): never {
    throw CASOS[c]!.lancar();
  }

  @Get("pipe")
  pipe(@Query(new ZodValidationPipe(z.object({ n: z.coerce.number().int() }))) q: unknown): { n: unknown } {
    return q as { n: unknown };
  }
}

describe("envelope de erro (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      controllers: [ControladorDeErros],
      providers: [{ provide: APP_FILTER, useClass: FiltroGlobalDeExcecoes }],
    }).compile();
    app = modulo.createNestApplication();
    configureApp(app as NestExpressApplication);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(Object.entries(CASOS))("caso %s produz o envelope válido", async (nome, caso) => {
    const resposta = await request(app.getHttpServer()).get(`/teste-erro/caso?c=${nome}`);

    expect(resposta.status).toBe(statusPorCodigo[caso.codigo]);
    const envelope = erroApiSchema.parse(resposta.body);
    expect(envelope.codigo).toBe(caso.codigo);
    expect(envelope.requestId).toBe(resposta.headers["x-request-id"]);
    expect(envelope.requestId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("todo código do catálogo tem ao menos um caso que o produz", () => {
    const cobertos = new Set(Object.values(CASOS).map((c) => c.codigo));
    expect([...cobertos].sort()).toEqual([...codigosDeErro].sort());
  });

  it("nenhuma mensagem deixa vazar termo interno", async () => {
    const proibidos = /prisma|postgres|econn|\/usr\/|\/app\/|node_modules|S3 /i;
    for (const nome of Object.keys(CASOS)) {
      const resposta = await request(app.getHttpServer()).get(`/teste-erro/caso?c=${nome}`);
      const { codigo, mensagem } = resposta.body as { codigo: CodigoDeErro; mensagem: string };
      expect(mensagem, `caso ${nome}`).not.toMatch(proibidos);
      if (codigo === "ERRO_INTERNO" || codigo === "SERVICO_INDISPONIVEL" || codigo === "CONFLITO_UNICIDADE") {
        expect(JSON.stringify(resposta.body), `caso ${nome}`).not.toMatch(proibidos);
      }
    }
  });

  it("erro interno traz a mensagem fixa com o requestId", async () => {
    const resposta = await request(app.getHttpServer()).get("/teste-erro/caso?c=interno").expect(500);

    expect(resposta.body.mensagem).toBe(`Algo deu errado. Informe o código ${resposta.body.requestId}.`);
  });

  it("limite de taxa de domínio devolve Retry-After", async () => {
    const resposta = await request(app.getHttpServer()).get("/teste-erro/caso?c=dominioTentativas").expect(429);

    expect(resposta.headers["retry-after"]).toBe("30");
  });

  it("validação zod vira detalhes por campo e mantém o corpo antigo", async () => {
    const resposta = await request(app.getHttpServer()).get("/teste-erro/pipe?n=abc").expect(400);

    expect(resposta.body.codigo).toBe("REQUISICAO_INVALIDA");
    expect(resposta.body.detalhes).toEqual([expect.objectContaining({ campo: "n" })]);
    // Compatibilidade até o web adotar o envelope (US12).
    expect(resposta.body.issues).toEqual([expect.objectContaining({ path: "n" })]);
  });

  it("mensagem em português de regra de negócio é preservada", async () => {
    const resposta = await request(app.getHttpServer()).get("/teste-erro/caso?c=invalida").expect(400);

    expect(resposta.body.mensagem).toBe("campo inválido");
    expect(resposta.body.message).toBe("campo inválido");
  });

  it("texto padrão do Nest vira a mensagem em português do catálogo", async () => {
    const resposta = await request(app.getHttpServer()).get("/teste-erro/caso?c=inexistente").expect(404);

    expect(resposta.body.mensagem).toBe("Não encontramos o que você procura.");
  });
});

describe("envelope de erro na aplicação real (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication();
    configureApp(app as NestExpressApplication);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rota inexistente responde com o envelope e o cabeçalho x-request-id", async () => {
    const resposta = await request(app.getHttpServer()).get("/rota-que-nao-existe").expect(404);

    const envelope = erroApiSchema.parse(resposta.body);
    expect(envelope.codigo).toBe("NAO_ENCONTRADO");
    expect(envelope.requestId).toBe(resposta.headers["x-request-id"]);
  });

  it("não aproveita x-request-id enviado pelo cliente", async () => {
    const resposta = await request(app.getHttpServer())
      .get("/rota-que-nao-existe")
      .set("x-request-id", "forjado")
      .expect(404);

    expect(resposta.headers["x-request-id"]).not.toBe("forjado");
  });
});
