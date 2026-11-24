import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { ProtocolosService } from "../src/engenharia/protocolos.service";

const ID = "00000000-0000-4000-8000-000000000c01";
const CLIENTE = "00000000-0000-4000-8000-000000000c02";
const UC = "00000000-0000-4000-8000-000000000c03";

/** Serviço dublê: o teste cobre portão, rotas, acesso e validação; as regras e o RLS têm testes próprios. */
const servico = {
  listar: vi.fn().mockResolvedValue({ itens: [] }),
  criar: vi.fn().mockResolvedValue({ id: ID }),
  opcoes: vi.fn().mockResolvedValue({ distribuidoras: [] }),
  clientes: vi.fn().mockResolvedValue({ itens: [] }),
  distribuidoras: vi.fn().mockResolvedValue({ itens: [] }),
  criarDistribuidora: vi.fn().mockResolvedValue({ itens: [] }),
  editarDistribuidora: vi.fn().mockResolvedValue({ itens: [] }),
  protocolo: vi.fn().mockResolvedValue({ id: ID }),
  editar: vi.fn().mockResolvedValue({ id: ID }),
  verificar: vi.fn().mockResolvedValue({ id: ID }),
  daUc: vi.fn().mockResolvedValue(null),
};

describe("protocolos na distribuidora (e2e)", () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const como = (departamentos: string) => (r: request.Test) => r.set("x-dev-principal", "00000000-0000-4000-8000-000000000001").set("x-dev-departamentos", departamentos);
  const engenharia = como("engenharia-obras:membro");
  const operacional = como("energia-opm:membro");
  const protocolo = { empresa: "waze", departamento: "engenharia-obras", clienteId: CLIENTE, ucId: UC, distribuidoraId: "amazonas-energia", tipo: "liberacao", numero: "123", abertoEm: "2026-11-10", dataLimite: "2026-11-30" };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ProtocolosService).useValue(servico).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("exige autenticação e a Engenharia ou o Operacional; as rotas fixas não caem no :id", async () => {
    await http().get("/protocolos").expect(401);
    await engenharia(http().get("/protocolos")).expect(200);
    await operacional(http().get("/protocolos?departamento=energia-opm&verificarHoje=sim")).expect(200);
    await como("crm:gerente")(http().get("/protocolos")).expect(403);
    await engenharia(http().get("/protocolos/opcoes")).expect(200);
    await engenharia(http().get("/protocolos/distribuidoras")).expect(200);
    await engenharia(http().get("/protocolos/clientes?busca=Cli")).expect(200);
    expect(servico.clientes).toHaveBeenCalledWith("Cli", expect.anything());
    await engenharia(http().get("/protocolos/clientes")).expect(400);
    await engenharia(http().get(`/protocolos/${ID}`)).expect(200);
    await engenharia(http().get("/protocolos/nao-e-uuid")).expect(400);
  });

  it("valida o protocolo, a verificação e a distribuidora antes do serviço", async () => {
    servico.criar.mockClear();
    await engenharia(http().post("/protocolos")).send({ ...protocolo, departamento: "crm" }).expect(400);
    await engenharia(http().post("/protocolos")).send({ ...protocolo, dataLimite: "2026-11-01" }).expect(400);
    await engenharia(http().post("/protocolos")).send({ ...protocolo, extra: 1 }).expect(400);
    expect(servico.criar).not.toHaveBeenCalled();
    await engenharia(http().post("/protocolos")).send(protocolo).expect(201);

    await engenharia(http().post(`/protocolos/${ID}/verificacoes`)).send({ situacao: "com_pendencia", proximaVerificacao: "2026-11-30" }).expect(400);
    await engenharia(http().post(`/protocolos/${ID}/verificacoes`)).send({ situacao: "liberado", proximaVerificacao: "2026-11-30" }).expect(400);
    await engenharia(http().post(`/protocolos/${ID}/verificacoes`)).send({ situacao: "em_analise" }).expect(400);
    await engenharia(http().post(`/protocolos/${ID}/verificacoes`)).send({ situacao: "com_pendencia", acaoPendente: "Enviar a ART", proximaVerificacao: "2026-11-30" }).expect(201);
    expect(servico.verificar).toHaveBeenLastCalledWith(ID, { situacao: "com_pendencia", acaoPendente: "Enviar a ART", proximaVerificacao: "2026-11-30" }, expect.anything());

    await engenharia(http().patch(`/protocolos/${ID}`)).send({}).expect(400);
    await engenharia(http().post("/protocolos/distribuidoras")).send({ nome: "Nova", uf: "pa" }).expect(400);
    await engenharia(http().patch("/protocolos/distribuidoras/Nova%20X")).send({ ativa: false }).expect(400);
    await engenharia(http().patch("/protocolos/distribuidoras/amazonas-energia")).send({ agenciaVirtualUrl: "http://agencia.exemplo.com.br" }).expect(400);
    await engenharia(http().patch("/protocolos/distribuidoras/amazonas-energia")).send({ agenciaVirtualUrl: "https://agencia.exemplo.com.br/servicos" }).expect(200);
  });

  it("com o portão da Engenharia fechado, tudo responde 404 antes da sessão", async () => {
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    const espiao = vi.spyOn(config, "get").mockImplementation(((chave: string, ...resto: unknown[]) =>
      chave === "ENGENHARIA_LIGADA" ? false : (original as (k: string, ...r: unknown[]) => unknown)(chave, ...resto)) as typeof config.get);
    try {
      await operacional(http().get("/protocolos")).expect(404);
      await http().get("/protocolos").expect(404);
      await http().post(`/protocolos/${ID}/verificacoes`).expect(404);
    } finally {
      espiao.mockRestore();
    }
  });
});
