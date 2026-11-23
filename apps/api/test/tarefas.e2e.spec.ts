import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { TarefasService } from "../src/tarefas/tarefas.service";

const ID = "00000000-0000-4000-8000-000000000a01";
const RESP = "00000000-0000-4000-8000-000000000a02";

/** Serviço dublê: o teste cobre portão, rotas, acesso e validação; as regras e o RLS têm testes próprios. */
const servico = {
  listar: vi.fn().mockResolvedValue({ itens: [] }),
  opcoes: vi.fn().mockResolvedValue({ pessoas: [] }),
  obter: vi.fn().mockResolvedValue({ id: ID }),
  criar: vi.fn().mockResolvedValue({ id: ID }),
  encerrar: vi.fn().mockResolvedValue({ id: ID }),
  concluir: vi.fn().mockResolvedValue({ id: ID }),
  baixarEvidencia: vi.fn(),
};

describe("tarefas dos departamentos (e2e)", () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const como = (departamentos: string) => (r: request.Test) => r.set("x-dev-principal", "00000000-0000-4000-8000-000000000001").set("x-dev-departamentos", departamentos);
  const engenharia = como("engenharia-obras:membro");
  const unica = { tipo: "unica", titulo: "Renovar a ART", empresa: "waze", responsavelId: RESP, horarioLimite: "12:00", exigeEvidencia: true, exigeResultado: false, data: "2026-12-01" };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(TarefasService).useValue(servico).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("exige autenticação; departamento fora da lista é 400; quem não é de nenhum departamento das tarefas é 403", async () => {
    await http().get("/tarefas/engenharia-obras").expect(401);
    await engenharia(http().get("/tarefas/engenharia-obras")).expect(200);
    await engenharia(http().get("/tarefas/crm")).expect(400);
    await como("crm:gerente")(http().get("/tarefas/engenharia-obras")).expect(403);
  });

  it("valida a nova tarefa, o período e a conclusão antes do serviço", async () => {
    servico.criar.mockClear();
    await engenharia(http().post("/tarefas/engenharia-obras")).send({ ...unica, exigeEvidencia: false }).expect(400);
    await engenharia(http().post("/tarefas/engenharia-obras")).send({ ...unica, tipo: "recorrente" }).expect(400);
    await engenharia(http().post("/tarefas/engenharia-obras")).send({ ...unica, tipo: "recorrente", data: undefined, inicio: "2026-12-01", regra: { recorrencia: "mensal_dia", dia: 30 } }).expect(400);
    expect(servico.criar).not.toHaveBeenCalled();
    await engenharia(http().post("/tarefas/engenharia-obras")).send(unica).expect(201);
    expect(servico.criar).toHaveBeenCalledWith("engenharia-obras", expect.objectContaining({ instrucoes: [] }), expect.anything());

    await engenharia(http().get("/tarefas/engenharia-obras?periodo=ontem")).expect(400);
    await engenharia(http().get("/tarefas/engenharia-obras?empresa=ambas")).expect(400);
    await engenharia(http().post(`/tarefas/engenharia-obras/${ID}/encerrar`)).send({}).expect(400);
    await engenharia(http().post(`/tarefas/engenharia-obras/ocorrencias/${ID}/concluir`)).field("checklist", "0,x").expect(400);
    await engenharia(http().post(`/tarefas/engenharia-obras/ocorrencias/${ID}/concluir`)).field("resultado", "Feito").field("checklist", "0,1").expect(200);
    expect(servico.concluir).toHaveBeenLastCalledWith("engenharia-obras", ID, { resultado: "Feito", checklist: [0, 1] }, undefined, expect.anything());
  });

  it("com o portão do departamento fechado, as tarefas dele respondem 404 antes da sessão; as dos outros seguem", async () => {
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    const espiao = vi.spyOn(config, "get").mockImplementation(((chave: string, ...resto: unknown[]) =>
      chave === "ENGENHARIA_LIGADA" ? false : (original as (k: string, ...r: unknown[]) => unknown)(chave, ...resto)) as typeof config.get);
    try {
      servico.listar.mockClear();
      await engenharia(http().get("/tarefas/engenharia-obras")).expect(404);
      await http().get("/tarefas/engenharia-obras").expect(404);
      await http().post(`/tarefas/engenharia-obras/ocorrencias/${ID}/concluir`).expect(404);
      expect(servico.listar).not.toHaveBeenCalled();
      await como("financeiro:membro")(http().get("/tarefas/financeiro")).expect(200);
    } finally {
      espiao.mockRestore();
    }
  });
});
