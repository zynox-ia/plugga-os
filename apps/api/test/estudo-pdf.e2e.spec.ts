import type { INestApplication } from "@nestjs/common";
import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DevAuthGuard } from "../src/core/auth/dev-auth.guard";
import { OriginCheckGuard } from "../src/core/auth/origin-check.guard";
import { RolesGuard } from "../src/core/auth/roles.guard";
import { EstudoController } from "../src/energy-efficiency/estudo.controller.js";
import { EstudoRepository } from "../src/energy-efficiency/estudo.repository.js";
import { EstudoService } from "../src/energy-efficiency/estudo.service.js";

/**
 * A rota do PDF pela porta HTTP.
 *
 * O que se prova aqui é o que o teste de unidade não alcança e o `gerarPdf` não
 * cobre: que `:id/document.pdf` não é engolida pela rota `:id`, que o corpo sai
 * como binário intacto e que o `Content-Disposition` carrega o nome certo — é
 * esse cabeçalho que decide como o arquivo chega na máquina do cliente.
 *
 * O serviço é dublê: o Chromium de verdade já é exercitado em
 * `estudo-eficiencia-energetica.e2e.spec.ts`, e repetir isso aqui só tornaria o
 * teste lento e dependente de navegador instalado.
 */
const PDF_FALSO = Buffer.from("%PDF-1.4\nconteudo\n%%EOF\n", "latin1");
const ID = "fcb7de1f-346c-4d4c-8ae7-f3435235f217";
const ID_BLOQUEADO = "0eb4c1f0-9f6c-4a41-8d2e-1a1a1a1a1a1a";

class EstudoServiceFalso {
  async pdf(id: string): Promise<{ arquivo: Buffer; nome: string }> {
    if (id === ID_BLOQUEADO) {
      throw new NotFoundException("estudo ainda não tem documento gerado ou está bloqueado");
    }
    return { arquivo: PDF_FALSO, nome: "estudo-eficiencia-energetica-plugga-uc-1-06-2026.pdf" };
  }
}

/** Repositório mínimo só para a rota chegar ao fim da cadeia de injeção. */
class RepositorioVazio {
  async documento(): Promise<string> {
    throw new NotFoundException("estudo ainda não tem documento gerado ou está bloqueado");
  }
}

describe("PDF do estudo de eficiência energética (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [EstudoController],
      providers: [{ provide: EstudoService, useClass: EstudoServiceFalso }],
    })
      // Autorização tem teste próprio; aqui o alvo é o transporte do arquivo.
      // O guarda de origem entra junto porque o controller inteiro é montado,
      // rotas de escrita incluídas — sem ele o módulo nem compila.
      .overrideGuard(DevAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OriginCheckGuard)
      .useValue({ canActivate: () => true })
      // O limite por IP tem teste próprio no módulo de auth; aqui ele só
      // atrapalharia, porque as asserções repetem a mesma rota.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("entrega o PDF como anexo, com o nome do estudo", async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/energy-efficiency/studies/${ID}/document.pdf`)
      .expect(200);

    expect(resposta.headers["content-type"]).toBe("application/pdf");
    expect(resposta.headers["content-disposition"]).toBe(
      'attachment; filename="estudo-eficiencia-energetica-plugga-uc-1-06-2026.pdf"',
    );
    // Binário byte a byte: qualquer reinterpretação como texto corromperia o
    // arquivo, e o navegador só reclamaria na hora de abrir.
    expect(Buffer.from(resposta.body).equals(PDF_FALSO)).toBe(true);
  });

  it("propaga a recusa quando o estudo não tem documento", async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/energy-efficiency/studies/${ID_BLOQUEADO}/document.pdf`)
      .expect(404);

    expect(resposta.body.message).toMatch(/bloqueado/);
  });

  it("recusa id que não é UUID sem chegar ao serviço", async () => {
    await request(app.getHttpServer())
      .get("/energy-efficiency/studies/nao-e-uuid/document.pdf")
      .expect(400);
  });
});

/**
 * O mesmo caminho, agora com o `EstudoService` **de verdade** — só o
 * repositório é dublê.
 *
 * Existe para provar a injeção de dependência ponta a ponta: controller →
 * service → repository. Sem o `@Inject` explícito, o esbuild do vitest não emite
 * `design:paramtypes`, o service recebe `undefined` e a rota estoura com
 * "Cannot read properties of undefined". Em produção o `nest build` emite o
 * metadado e a cadeia funciona — este teste é o que garante que o teste não
 * mente sobre isso.
 */
describe("PDF do estudo — cadeia de injeção real", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [EstudoController],
      providers: [
        EstudoService,
        { provide: EstudoRepository, useClass: RepositorioVazio },
      ],
    })
      .overrideGuard(DevAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OriginCheckGuard)
      .useValue({ canActivate: () => true })
      // O limite por IP tem teste próprio no módulo de auth; aqui ele só
      // atrapalharia, porque as asserções repetem a mesma rota.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("chega ao repositório sem dublar o service", async () => {
    const resposta = await request(app.getHttpServer())
      .get(`/energy-efficiency/studies/${ID}/document.pdf`)
      .expect(404);

    // 404 com a mensagem do repositório prova que a chamada atravessou o
    // service real; `undefined` na injeção daria 500.
    expect(resposta.body.message).toMatch(/documento gerado/);
  });
});
