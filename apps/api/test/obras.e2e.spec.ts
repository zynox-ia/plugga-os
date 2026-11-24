import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { ObrasService } from "../src/engenharia/obras.service";

const ID = "00000000-0000-4000-8000-000000000e01";
const MARCO = "00000000-0000-4000-8000-000000000e02";
const CLIENTE = "00000000-0000-4000-8000-000000000e03";

/** Serviço dublê: o teste cobre portão, rotas, acesso e validação; as regras e o RLS têm testes próprios. */
const servico = {
  listar: vi.fn().mockResolvedValue({ itens: [] }),
  cadastrar: vi.fn().mockResolvedValue({ id: ID }),
  opcoes: vi.fn().mockResolvedValue({ responsaveis: [] }),
  clientes: vi.fn().mockResolvedValue({ itens: [] }),
  obra: vi.fn().mockResolvedValue({ id: ID }),
  editar: vi.fn().mockResolvedValue({ id: ID }),
  marcarFeito: vi.fn().mockResolvedValue({ id: ID }),
  reprogramar: vi.fn().mockResolvedValue({ id: ID }),
  anexar: vi.fn().mockResolvedValue({ id: ID }),
  baixar: vi.fn(),
};

describe("obras (e2e)", () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const como = (departamentos: string) => (r: request.Test) => r.set("x-dev-principal", "00000000-0000-4000-8000-000000000001").set("x-dev-departamentos", departamentos);
  const engenharia = como("engenharia-obras:membro");
  const obra = { empresa: "waze", clienteId: CLIENTE, nome: "Galpão Tarumã", potenciaKwp: "61,2", inicioEm: "2026-10-20", entregaPrevistaEm: "2027-02-26" };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ObrasService).useValue(servico).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("exige autenticação e a Engenharia; as rotas fixas não caem no :id", async () => {
    await http().get("/engenharia/obras").expect(401);
    await engenharia(http().get("/engenharia/obras?atrasadas=sim")).expect(200);
    await como("financeiro:gerente")(http().get("/engenharia/obras")).expect(403);
    await engenharia(http().get("/engenharia/obras/opcoes")).expect(200);
    await engenharia(http().get("/engenharia/obras/clientes?busca=Cli")).expect(200);
    expect(servico.clientes).toHaveBeenCalledWith("Cli", expect.anything());
    await engenharia(http().get(`/engenharia/obras/${ID}`)).expect(200);
    await engenharia(http().get("/engenharia/obras/nao-e-uuid")).expect(400);
  });

  it("valida a obra, o marco e o documento antes do serviço", async () => {
    servico.cadastrar.mockClear();
    await engenharia(http().post("/engenharia/obras")).send({ ...obra, entregaPrevistaEm: "2026-10-19" }).expect(400);
    await engenharia(http().post("/engenharia/obras")).send({ ...obra, tipo: "interno" }).expect(400);
    await engenharia(http().post("/engenharia/obras")).send({ ...obra, potenciaKwp: "zero" }).expect(400);
    expect(servico.cadastrar).not.toHaveBeenCalled();
    await engenharia(http().post("/engenharia/obras")).send(obra).expect(201);
    expect(servico.cadastrar).toHaveBeenCalledWith(expect.objectContaining({ potenciaKwp: "61.2", tipo: "obra_solar" }), expect.anything());

    await engenharia(http().patch(`/engenharia/obras/${ID}`)).send({}).expect(400);
    await engenharia(http().patch(`/engenharia/obras/${ID}`)).send({ orcamento: "dez mil" }).expect(400);
    await engenharia(http().post(`/engenharia/obras/${ID}/marcos/${MARCO}/feito`)).expect(200);
    await engenharia(http().patch(`/engenharia/obras/${ID}/marcos/${MARCO}`)).send({ previstoEm: "31/12/2026" }).expect(400);
    await engenharia(http().post(`/engenharia/obras/${ID}/documentos`)).field("categoria", "planta").expect(400);
    await engenharia(http().post(`/engenharia/obras/${ID}/documentos`)).field("categoria", "ata").field("protocoloId", ID).expect(400);
    await engenharia(http().post(`/engenharia/obras/${ID}/documentos`)).field("categoria", "cronograma").attach("arquivo", Buffer.from("%PDF-1.4"), "c.pdf").expect(201);
  });

  it("com o portão da Engenharia fechado, tudo responde 404 antes da sessão", async () => {
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    const espiao = vi.spyOn(config, "get").mockImplementation(((chave: string, ...resto: unknown[]) =>
      chave === "ENGENHARIA_LIGADA" ? false : (original as (k: string, ...r: unknown[]) => unknown)(chave, ...resto)) as typeof config.get);
    try {
      await engenharia(http().get("/engenharia/obras")).expect(404);
      await http().post("/engenharia/obras").expect(404);
    } finally {
      espiao.mockRestore();
    }
  });
});
