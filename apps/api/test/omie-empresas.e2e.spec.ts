import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { OmieConexoesService } from "../src/omie/omie-conexoes.service";

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
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(OmieConexoesService).useValue(servico).compile();
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
    await gerente(http().put("/integracoes/omie/empresas/outra")).send({ appKey: "chave-123456", appSecret: "segredo-1234567890ab" }).expect(400);
    await gerente(http().put("/integracoes/omie/empresas/waze")).send({ appKey: "x" }).expect(400);
    expect(servico.gravar).not.toHaveBeenCalled();
    await gerente(http().put("/integracoes/omie/empresas/waze")).send({ appKey: "chave-123456", appSecret: "segredo-1234567890ab" }).expect(200);
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
});
