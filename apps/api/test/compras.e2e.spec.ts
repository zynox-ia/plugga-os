import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { ComprasService } from "../src/compras/compras.service";

const ID = "00000000-0000-4000-8000-000000000701";

/** Serviço dublê: o teste cobre rotas, guards e validação de entrada; regras e acesso fino têm testes próprios. */
const servico = {
  quadro: vi.fn().mockResolvedValue({ colunas: [] }),
  listar: vi.fn().mockResolvedValue({ itens: [], total: 0 }),
  opcoes: vi.fn().mockResolvedValue({ pessoas: [], obras: [], fornecedores: [] }),
  obter: vi.fn().mockResolvedValue({ id: ID }),
  criar: vi.fn().mockResolvedValue({ id: ID }),
  editar: vi.fn().mockResolvedValue({ id: ID }),
  executarAcao: vi.fn().mockResolvedValue({ id: ID }),
  buscarClientes: vi.fn().mockResolvedValue({ itens: [] }),
};

describe("compras API (e2e)", () => {
  let app: INestApplication;
  const como = (departamentos: string) => (r: request.Test) => r.set("x-dev-principal", "00000000-0000-4000-8000-000000000001").set("x-dev-departamentos", departamentos);
  const compras = como("suprimentos:membro");
  const financeiro = como("financeiro:membro");

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ComprasService).useValue(servico).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("exige autenticação", async () => {
    await request(app.getHttpServer()).get("/suprimentos/compras/quadro").expect(401);
  });

  it("Compras e Financeiro entram; CRM e Engenharia não", async () => {
    await compras(request(app.getHttpServer()).get("/suprimentos/compras/quadro")).expect(200);
    await financeiro(request(app.getHttpServer()).get("/suprimentos/compras/pedidos")).expect(200);
    for (const departamento of ["crm:membro", "engenharia-obras:gerente"]) {
      await como(departamento)(request(app.getHttpServer()).get("/suprimentos/compras/quadro")).expect(403);
    }
  });

  it("valida o corpo da ação, o filtro do quadro e o pedido antes do serviço", async () => {
    servico.executarAcao.mockClear();
    await compras(request(app.getHttpServer()).post(`/suprimentos/compras/pedidos/${ID}/acoes`)).send({ acao: "concluir" }).expect(400);
    await compras(request(app.getHttpServer()).post(`/suprimentos/compras/pedidos/${ID}/acoes`)).send({ acao: "cancelar" }).expect(400);
    expect(servico.executarAcao).not.toHaveBeenCalled();
    await compras(request(app.getHttpServer()).post(`/suprimentos/compras/pedidos/${ID}/acoes`)).send({ acao: "cancelar", motivo: "Desistiu" }).expect(200);
    expect(servico.executarAcao).toHaveBeenCalledWith(ID, { acao: "cancelar", motivo: "Desistiu" }, expect.anything());

    await compras(request(app.getHttpServer()).get("/suprimentos/compras/quadro?empresa=outra")).expect(400);
    await compras(request(app.getHttpServer()).get("/suprimentos/compras/quadro?empresa=waze&de=2026-11-01")).expect(200);
    await compras(request(app.getHttpServer()).post("/suprimentos/compras/pedidos")).send({ titulo: "Sem empresa", destino: "interno" }).expect(400);
    await compras(request(app.getHttpServer()).get("/suprimentos/compras/pedidos/nao-e-uuid")).expect(400);
  });

  it("o Compras não cria obra: escolhe do cadastro de Obras (PLU-355)", async () => {
    await compras(request(app.getHttpServer()).post("/suprimentos/compras/obras")).send({ empresa: "waze", nome: "Obra rápida" }).expect(404);
  });

  it("não há rota de exclusão de pedido nem de cotação", async () => {
    await compras(request(app.getHttpServer()).delete(`/suprimentos/compras/pedidos/${ID}`)).expect(404);
    await compras(request(app.getHttpServer()).delete(`/suprimentos/compras/pedidos/${ID}/cotacoes/${ID}`)).expect(404);
  });
});
