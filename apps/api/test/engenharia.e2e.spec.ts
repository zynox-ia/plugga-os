import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { EngenhariaService } from "../src/engenharia/engenharia.service";

const ID = "00000000-0000-4000-8000-000000000901";
const TECNICO = "00000000-0000-4000-8000-000000000902";

/** Serviço dublê: o teste cobre portão, rotas, acesso e validação; as regras têm testes próprios. */
const servico = {
  listar: vi.fn().mockResolvedValue({ itens: [], total: 0 }),
  quadro: vi.fn().mockResolvedValue({ colunas: [] }),
  opcoes: vi.fn().mockResolvedValue({ tecnicos: [] }),
  buscarClientes: vi.fn().mockResolvedValue({ itens: [] }),
  obter: vi.fn().mockResolvedValue({ id: ID }),
  criar: vi.fn().mockResolvedValue({ id: ID }),
  editar: vi.fn().mockResolvedValue({ id: ID }),
  executarAcao: vi.fn().mockResolvedValue({ id: ID }),
  enviarFoto: vi.fn().mockResolvedValue({ id: ID }),
  colherTermo: vi.fn().mockResolvedValue({ id: ID }),
  anexarTermoAssinado: vi.fn().mockResolvedValue({ id: ID }),
  pedirMaterial: vi.fn().mockResolvedValue({ id: ID }),
};

describe("ordens de serviço da Engenharia (e2e)", () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const como = (departamentos: string) => (r: request.Test) => r.set("x-dev-principal", "00000000-0000-4000-8000-000000000001").set("x-dev-departamentos", departamentos);
  const engenharia = como("engenharia-obras:membro");

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EngenhariaService).useValue(servico).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("exige autenticação e entra só quem é da Engenharia (ou da plataforma)", async () => {
    await http().get("/engenharia/ordens-de-servico").expect(401);
    await engenharia(http().get("/engenharia/ordens-de-servico")).expect(200);
    await http().get("/engenharia/ordens-de-servico/quadro").set("x-dev-principal", "00000000-0000-4000-8000-000000000002").set("x-dev-plataforma", "admin").expect(200);
    for (const departamento of ["crm:gerente", "suprimentos:gerente", "financeiro:gerente"]) {
      await como(departamento)(http().get("/engenharia/ordens-de-servico")).expect(403);
    }
  });

  it("valida filtros, criação e ações antes do serviço", async () => {
    servico.criar.mockClear();
    servico.executarAcao.mockClear();
    await engenharia(http().get("/engenharia/ordens-de-servico?situacao=fechada")).expect(400);
    await engenharia(http().get("/engenharia/ordens-de-servico/quadro?situacao=aberta")).expect(400);
    await engenharia(http().get("/engenharia/ordens-de-servico/clientes?busca=a")).expect(400);
    await engenharia(http().post("/engenharia/ordens-de-servico")).send({ empresa: "waze", tipo: "manutencao", descricao: "x", prazo: "2026-12-01" }).expect(400);
    expect(servico.criar).not.toHaveBeenCalled();
    await engenharia(http().post("/engenharia/ordens-de-servico")).send({ empresa: "waze", tipo: "manutencao", clienteId: ID, descricao: "Inversor", prazo: "2026-12-01" }).expect(201);
    expect(servico.criar).toHaveBeenCalledWith(expect.objectContaining({ prioridade: "normal", origem: "manual" }), expect.anything());

    await engenharia(http().post(`/engenharia/ordens-de-servico/${ID}/acoes`)).send({ acao: "agendar", tecnicoId: TECNICO, data: "2026-12-01" }).expect(400);
    await engenharia(http().post(`/engenharia/ordens-de-servico/${ID}/acoes`)).send({ acao: "agendar", tecnicoId: TECNICO, data: "2026-12-01", horario: "25:00" }).expect(400);
    await engenharia(http().post(`/engenharia/ordens-de-servico/${ID}/acoes`)).send({ acao: "adiar", novaData: "2026-12-01" }).expect(400);
    await engenharia(http().post(`/engenharia/ordens-de-servico/${ID}/acoes`)).send({ acao: "cancelar" }).expect(400);
    expect(servico.executarAcao).not.toHaveBeenCalled();
    await engenharia(http().post(`/engenharia/ordens-de-servico/${ID}/acoes`)).send({ acao: "agendar", tecnicoId: TECNICO, data: "2026-12-01", horario: "09:00" }).expect(200);
    await engenharia(http().post("/engenharia/ordens-de-servico/nao-e-uuid/acoes")).send({ acao: "cancelar", motivo: "x" }).expect(400);
  });

  it("termo e pedido de material são validados antes do serviço", async () => {
    servico.colherTermo.mockClear();
    servico.pedirMaterial.mockClear();
    await engenharia(http().post(`/engenharia/ordens-de-servico/${ID}/termo`)).field("modo", "pdf_externo").field("nome", "Maria Cliente").field("documento", "12345678901").expect(400);
    await engenharia(http().post(`/engenharia/ordens-de-servico/${ID}/termo`)).field("modo", "nome_digitado").field("nome", "Maria Cliente").expect(400);
    expect(servico.colherTermo).not.toHaveBeenCalled();
    await engenharia(http().post(`/engenharia/ordens-de-servico/${ID}/termo`)).field("modo", "nome_digitado").field("nome", "Maria Cliente").field("documento", "12345678901").expect(201);

    await engenharia(http().post(`/engenharia/ordens-de-servico/${ID}/pedidos-de-material`)).send({ prazoEntregaDesejado: "2026-12-01", itens: [] }).expect(400);
    expect(servico.pedirMaterial).not.toHaveBeenCalled();
    await engenharia(http().post(`/engenharia/ordens-de-servico/${ID}/pedidos-de-material`)).send({ prazoEntregaDesejado: "2026-12-01", itens: [{ descricao: "Cabo", quantidade: "10" }] }).expect(201);
  });

  it("com o portão da Engenharia fechado, todas as rotas respondem 404, antes até da sessão", async () => {
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    const espiao = vi.spyOn(config, "get").mockImplementation(((chave: string, ...resto: unknown[]) =>
      chave === "ENGENHARIA_LIGADA" ? false : (original as (k: string, ...r: unknown[]) => unknown)(chave, ...resto)) as typeof config.get);
    try {
      servico.listar.mockClear();
      await engenharia(http().get("/engenharia/ordens-de-servico")).expect(404);
      await engenharia(http().get(`/engenharia/ordens-de-servico/${ID}`)).expect(404);
      await engenharia(http().post(`/engenharia/ordens-de-servico/${ID}/acoes`)).send({ acao: "cancelar", motivo: "x" }).expect(404);
      // Sem cookie nem cabeçalho de sessão: 404, não 401.
      await http().get("/engenharia/ordens-de-servico").expect(404);
      await http().get("/engenharia/ordens-de-servico/quadro").expect(404);
      expect(servico.listar).not.toHaveBeenCalled();
    } finally {
      espiao.mockRestore();
    }
    await http().get("/engenharia/ordens-de-servico").expect(401);
  });
});
