import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { EstoqueService } from "../src/estoque/estoque.service";

const ID = "00000000-0000-4000-8000-000000000801";

/** Serviço dublê: o teste cobre rotas, acesso e validação de entrada; regras e persistência têm testes próprios. */
const servico = {
  listar: vi.fn().mockResolvedValue({ itens: [], resumo: {} }),
  obter: vi.fn().mockResolvedValue({ id: ID }),
  criar: vi.fn().mockResolvedValue({ id: ID }),
  editar: vi.fn().mockResolvedValue({ id: ID }),
  mudarSituacao: vi.fn().mockResolvedValue({ id: ID }),
  registrarMovimentacao: vi.fn().mockResolvedValue({ id: ID }),
  listarMovimentacoes: vi.fn().mockResolvedValue({ dias: [], resumo: {}, total: 0 }),
  opcoes: vi.fn().mockResolvedValue({ obras: [] }),
  buscarClientes: vi.fn().mockResolvedValue({ itens: [] }),
  abrirPedido: vi.fn().mockResolvedValue({ pedidoId: ID, numero: 1 }),
  pedidosParaEntrada: vi.fn().mockResolvedValue({ itens: [] }),
};

describe("estoque API (e2e)", () => {
  let app: INestApplication;
  const como = (departamentos: string) => (r: request.Test) => r.set("x-dev-principal", "00000000-0000-4000-8000-000000000001").set("x-dev-departamentos", departamentos);
  const suprimentos = como("suprimentos:membro");

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EstoqueService).useValue(servico).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("exige autenticação", async () => {
    await request(app.getHttpServer()).get("/suprimentos/estoque/itens").expect(401);
  });

  it("Suprimentos entra; CRM, Financeiro e Engenharia não", async () => {
    await suprimentos(request(app.getHttpServer()).get("/suprimentos/estoque/itens")).expect(200);
    await suprimentos(request(app.getHttpServer()).get("/suprimentos/estoque/movimentacoes?periodo=mes")).expect(200);
    for (const d of ["crm:membro", "financeiro:gerente", "engenharia-obras:membro"]) {
      await como(d)(request(app.getHttpServer()).get("/suprimentos/estoque/itens")).expect(403);
    }
  });

  it("valida a movimentação antes do serviço: reserva não é da tela e ajuste exige motivo", async () => {
    servico.registrarMovimentacao.mockClear();
    await suprimentos(request(app.getHttpServer()).post("/suprimentos/estoque/movimentacoes")).send({ tipo: "reserva", itemId: ID, quantidade: "1" }).expect(400);
    await suprimentos(request(app.getHttpServer()).post("/suprimentos/estoque/movimentacoes")).send({ tipo: "ajuste", itemId: ID, saldoContado: "3" }).expect(400);
    expect(servico.registrarMovimentacao).not.toHaveBeenCalled();
    await suprimentos(request(app.getHttpServer()).post("/suprimentos/estoque/movimentacoes")).send({ tipo: "ajuste", itemId: ID, saldoContado: "3", observacao: "Contagem" }).expect(201);
  });

  it("pedidos para a entrada por compra: rota do Estoque, com o id validado", async () => {
    await suprimentos(request(app.getHttpServer()).get(`/suprimentos/estoque/itens/${ID}/pedidos-para-entrada`)).expect(200);
    expect(servico.pedidosParaEntrada).toHaveBeenCalledWith(ID);
    await como("crm:membro")(request(app.getHttpServer()).get(`/suprimentos/estoque/itens/${ID}/pedidos-para-entrada`)).expect(403);
    await suprimentos(request(app.getHttpServer()).get("/suprimentos/estoque/itens/nao-e-uuid/pedidos-para-entrada")).expect(400);
  });

  it("não há rota de exclusão de item nem de movimentação", async () => {
    await suprimentos(request(app.getHttpServer()).delete(`/suprimentos/estoque/itens/${ID}`)).expect(404);
    await suprimentos(request(app.getHttpServer()).delete(`/suprimentos/estoque/movimentacoes/${ID}`)).expect(404);
  });

  it("filtros da lista e do período são validados", async () => {
    await suprimentos(request(app.getHttpServer()).get("/suprimentos/estoque/itens?saldo=com_reserva&empresa=waze")).expect(200);
    await suprimentos(request(app.getHttpServer()).get("/suprimentos/estoque/itens?saldo=baixo")).expect(400);
    await suprimentos(request(app.getHttpServer()).get("/suprimentos/estoque/movimentacoes?periodo=7&de=2026-11-01")).expect(400);
  });
});
