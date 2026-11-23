import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { UsinasService } from "../src/engenharia/usinas.service";

const ID = "00000000-0000-4000-8000-000000000b01";
const CLIENTE = "00000000-0000-4000-8000-000000000b02";
const UC = "00000000-0000-4000-8000-000000000b03";

/** Serviço dublê: o teste cobre portão, rotas, acesso e validação; as regras e o RLS têm testes próprios. */
const servico = {
  usinas: vi.fn().mockResolvedValue({ itens: [], total: 0 }),
  usina: vi.fn().mockResolvedValue({ id: ID }),
  criarUsina: vi.fn().mockResolvedValue({ id: ID }),
  editarUsina: vi.fn().mockResolvedValue({ id: ID }),
  monitoramentoDoDia: vi.fn().mockResolvedValue({ cards: [] }),
  conferir: vi.fn().mockResolvedValue({ cards: [] }),
  baixarPrint: vi.fn(),
  plataformas: vi.fn().mockResolvedValue({ itens: [] }),
  criarPlataforma: vi.fn().mockResolvedValue({ itens: [] }),
  editarPlataforma: vi.fn().mockResolvedValue({ itens: [] }),
};

describe("usinas, monitoramento e plataformas (e2e)", () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const como = (departamentos: string) => (r: request.Test) => r.set("x-dev-principal", "00000000-0000-4000-8000-000000000001").set("x-dev-departamentos", departamentos);
  const engenharia = como("engenharia-obras:membro");
  const usina = { empresa: "waze", clienteId: CLIENTE, ucId: UC, nome: "Telhado", plataformaId: "growatt", potenciaKwp: "12,75", comissionadaEm: "2025-03-14" };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(UsinasService).useValue(servico).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("exige autenticação e quem é da Engenharia", async () => {
    await http().get("/engenharia/usinas").expect(401);
    await engenharia(http().get("/engenharia/usinas")).expect(200);
    await engenharia(http().get("/engenharia/monitoramento?empresa=waze")).expect(200);
    await engenharia(http().get("/engenharia/plataformas")).expect(200);
    await como("crm:gerente")(http().get("/engenharia/monitoramento")).expect(403);
  });

  it("valida a usina (kWp com vírgula), a conferência e a plataforma antes do serviço", async () => {
    servico.criarUsina.mockClear();
    await engenharia(http().post("/engenharia/usinas")).send({ ...usina, potenciaKwp: "doze" }).expect(400);
    await engenharia(http().post("/engenharia/usinas")).send({ ...usina, ucId: undefined }).expect(400);
    expect(servico.criarUsina).not.toHaveBeenCalled();
    await engenharia(http().post("/engenharia/usinas")).send(usina).expect(201);
    expect(servico.criarUsina).toHaveBeenCalledWith(expect.objectContaining({ potenciaKwp: "12.75" }), expect.anything());

    await engenharia(http().post("/engenharia/monitoramento/Growatt%20X/conferir")).field("empresa", "waze").expect(400);
    await engenharia(http().post("/engenharia/monitoramento/growatt/conferir")).field("empresa", "outra").expect(400);
    await engenharia(http().post("/engenharia/monitoramento/growatt/conferir")).field("empresa", "waze").field("resultados", JSON.stringify([{ usinaId: ID, situacao: "anomalia" }])).expect(400);
    await engenharia(http().post("/engenharia/monitoramento/growatt/conferir")).field("empresa", "waze").field("resultados", JSON.stringify([{ usinaId: ID, situacao: "anomalia", nota: "Geração baixa", abrirOs: true }])).expect(201);
    expect(servico.conferir).toHaveBeenLastCalledWith("growatt", { empresa: "waze", resultados: [{ usinaId: ID, situacao: "anomalia", nota: "Geração baixa", abrirOs: true }] }, undefined, expect.anything());

    await engenharia(http().post("/engenharia/plataformas")).send({}).expect(400);
    await engenharia(http().patch("/engenharia/plataformas/growatt")).send({}).expect(400);
  });

  it("com o portão da Engenharia fechado, tudo responde 404 antes da sessão", async () => {
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    const espiao = vi.spyOn(config, "get").mockImplementation(((chave: string, ...resto: unknown[]) =>
      chave === "ENGENHARIA_LIGADA" ? false : (original as (k: string, ...r: unknown[]) => unknown)(chave, ...resto)) as typeof config.get);
    try {
      await engenharia(http().get("/engenharia/usinas")).expect(404);
      await http().get("/engenharia/monitoramento").expect(404);
      await http().post("/engenharia/monitoramento/growatt/conferir").expect(404);
      await http().get("/engenharia/plataformas").expect(404);
    } finally {
      espiao.mockRestore();
    }
  });
});
