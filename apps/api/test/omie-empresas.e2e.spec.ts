import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { EstadoInvalido } from "../src/common/errors/dominio";
import { OmieConexoesService } from "../src/omie/omie-conexoes.service";
import { OmieImportacaoService } from "../src/omie/omie-importacao.service";
import { OmieFalhouError } from "../src/omie/omie.port";

/** Serviço dublê: o teste cobre rotas, acesso e validação; a conferência tem teste próprio. */
const servico = {
  estado: vi.fn().mockResolvedValue({ conexoes: [] }),
  gravar: vi.fn().mockResolvedValue({ conexoes: [] }),
  apagar: vi.fn().mockResolvedValue({ conexoes: [] }),
  testar: vi.fn().mockResolvedValue({ conexoes: [] }),
  confirmar: vi.fn().mockResolvedValue({ conexoes: [] }),
  moverContaAntiga: vi.fn().mockResolvedValue({ conexoes: [] }),
  definirCnpj: vi.fn().mockResolvedValue({ conexoes: [] }),
  credenciais: vi.fn().mockResolvedValue(null),
};

/** Importar e conferir (S4), dublê: as regras e o banco têm teste próprio. */
const importacao = { conferir: vi.fn().mockResolvedValue({ empresa: "waze" }), importar: vi.fn().mockResolvedValue({ conferencia: {} }) };

describe("OMIE por empresa (e2e)", () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const como = (departamentos: string) => (r: request.Test) => r.set("x-dev-principal", "00000000-0000-4000-8000-000000000001").set("x-dev-departamentos", departamentos);
  const admin = (r: request.Test) => r.set("x-dev-principal", "00000000-0000-4000-8000-000000000002").set("x-dev-plataforma", "admin");
  const gerente = como("financeiro:gerente");

  const mestraAnterior = process.env.SECRETS_ENCRYPTION_KEY;

  beforeAll(async () => {
    // Chave-mestra sintética: gravar o par exige o cofre configurado.
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString("base64");
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(OmieConexoesService).useValue(servico).overrideProvider(OmieImportacaoService).useValue(importacao).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (mestraAnterior === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
    else process.env.SECRETS_ENCRYPTION_KEY = mestraAnterior;
    await app.close();
  });

  it("Gerente do Financeiro, Admin e Desenvolvedor gerem; membro do Financeiro e CRM não", async () => {
    await gerente(http().get("/integracoes/omie/empresas")).expect(200);
    await admin(http().get("/integracoes/omie/empresas")).expect(200);
    for (const d of ["financeiro:membro", "crm:gerente", "suprimentos:gerente"]) {
      await como(d)(http().get("/integracoes/omie/empresas")).expect(403);
    }
    await http().get("/integracoes/omie/empresas").expect(401);
  });

  it("empresa fora de Plugga e Waze é 400; o par é validado antes do serviço", async () => {
    servico.gravar.mockClear();
    await gerente(http().put("/integracoes/omie/empresas/outra")).send({ appKey: "chave-123456", appSecret: "ficticio-ficticio-ficticio" }).expect(400);
    await gerente(http().put("/integracoes/omie/empresas/waze")).send({ appKey: "x" }).expect(400);
    expect(servico.gravar).not.toHaveBeenCalled();
    await gerente(http().put("/integracoes/omie/empresas/waze")).send({ appKey: "chave-123456", appSecret: "ficticio-ficticio-ficticio" }).expect(200);
  });

  it("confirmar exige os 14 dígitos do CNPJ", async () => {
    await gerente(http().post("/integracoes/omie/empresas/plugga/confirmar")).send({ cnpj: "123" }).expect(400);
    await gerente(http().post("/integracoes/omie/empresas/plugga/confirmar")).send({ cnpj: "99.999.001/0001-59" }).expect(200);
    expect(servico.confirmar).toHaveBeenLastCalledWith("plugga", "99999001000159", expect.anything());
  });

  it("o CNPJ do cadastro é só da plataforma: o Gerente do Financeiro não define a própria referência", async () => {
    await gerente(http().put("/integracoes/omie/empresas/plugga/cnpj")).send({ cnpj: "99999001000159" }).expect(403);
    await admin(http().put("/integracoes/omie/empresas/plugga/cnpj")).send({ cnpj: "99999001000159" }).expect(200);
    await admin(http().put("/integracoes/omie/empresas/plugga/cnpj")).send({ cnpj: null }).expect(200);
  });

  it("com o portão do Financeiro fechado, as rotas por empresa respondem 404 e as da conta única seguem", async () => {
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    const espiao = vi.spyOn(config, "get").mockImplementation(((chave: string, ...resto: unknown[]) =>
      chave === "FINANCEIRO_LIGADO" ? false : (original as (k: string, ...r: unknown[]) => unknown)(chave, ...resto)) as typeof config.get);
    try {
      await gerente(http().get("/integracoes/omie/empresas")).expect(404);
      await admin(http().put("/integracoes/omie/empresas/plugga/cnpj")).send({ cnpj: null }).expect(404);
      // Antes da sessão: sem login também é 404, não 401.
      await http().get("/integracoes/omie/empresas").expect(404);
      // A conta única não está atrás do portão (sem banco neste teste, ela não chega a 200).
      const antiga = await http().get("/integracoes/omie").set("x-dev-principal", "00000000-0000-4000-8000-000000000003").set("x-dev-plataforma", "desenvolvedor");
      expect(antiga.status).not.toBe(404);
    } finally {
      espiao.mockRestore();
    }
  });

  it("conferir e importar do OMIE (S4): só a gerência e a plataforma; sem conexão é 409; o OMIE fora do ar é 503 com texto fixo", async () => {
    importacao.conferir.mockClear();
    importacao.importar.mockClear();
    for (const d of ["financeiro:membro", "suprimentos:gerente"]) {
      await como(d)(http().get("/integracoes/omie/empresas/waze/conferencia")).expect(403);
      await como(d)(http().post("/integracoes/omie/empresas/waze/importacao")).expect(403);
    }
    await gerente(http().get("/integracoes/omie/empresas/outra/conferencia")).expect(400);
    expect(importacao.conferir).not.toHaveBeenCalled();
    await gerente(http().get("/integracoes/omie/empresas/waze/conferencia")).expect(200);
    await admin(http().post("/integracoes/omie/empresas/plugga/importacao")).expect(200);
    expect(importacao.importar.mock.calls[0]?.[0]).toBe("plugga");

    importacao.importar.mockRejectedValueOnce(new EstadoInvalido("Conecte o OMIE da Waze antes de importar."));
    const semConexao = await gerente(http().post("/integracoes/omie/empresas/waze/importacao")).expect(409);
    expect(semConexao.body).toMatchObject({ mensagem: "Conecte o OMIE da Waze antes de importar." });
    importacao.conferir.mockRejectedValueOnce(new OmieFalhouError("indisponivel"));
    // Como nas outras rotas do conector: o filtro global responde 503 com o texto fixo, sem a resposta do OMIE.
    const foraDoAr = await gerente(http().get("/integracoes/omie/empresas/waze/conferencia")).expect(503);
    expect(foraDoAr.body).toMatchObject({ codigo: "SERVICO_INDISPONIVEL", mensagem: "Não foi possível falar com o OMIE. Tente de novo em instantes." });
  });
});
