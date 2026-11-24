import { createHash } from "node:crypto";

import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import type { Acesso, AcaoDeAgente } from "@plugga/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AppModule } from "../src/app.module";
import { AgentLookupRepository } from "../src/core/auth/agent-lookup.repository";
import type { AuthPrincipal } from "../src/core/auth/auth.types";
import { OrdensPeloAgenteService } from "../src/engenharia/ordens-pelo-agente.service";

const OS = "00000000-0000-4000-8000-000000000d01";
const AGENTE = "00000000-0000-4000-8000-000000000d02";
const token = (nome: string) => `plg_agent_${createHash("sha256").update(nome).digest("base64url").slice(0, 43)}`;
const hash = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");

/** Agentes dublê, pelo hash do token: o caminho do Bearer é o real. */
const engenharia: Acesso = { plataforma: null, departamentos: [{ departamento: "engenharia-obras", nivel: "membro", telas: ["engenharia-obras.os"] }] };
const agentes = new Map<string, AuthPrincipal>([
  [hash(token("robo")), { id: AGENTE, kind: "service", acesso: engenharia, acoesDeAgente: ["engenharia.ordem.criar"] as AcaoDeAgente[] }],
  [hash(token("semAcao")), { id: AGENTE, kind: "service", acesso: engenharia, acoesDeAgente: [] }],
  [hash(token("crm")), { id: AGENTE, kind: "service", acesso: { plataforma: null, departamentos: [{ departamento: "crm", nivel: "membro", telas: ["crm.clientes"] }] }, acoesDeAgente: ["engenharia.ordem.criar"] as AcaoDeAgente[] }],
]);
const lookup = { resolvePrincipal: async (h: string) => agentes.get(h) ?? null, identidadeAtiva: async () => true };

/** Serviço dublê: o teste cobre portão, guards, validação e o status; as regras e o RLS têm testes próprios. */
const servico = { criar: vi.fn() };

describe("O.S. pelo robô (e2e)", () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const corpo = { empresa: "waze", tipo: "manutencao", descricao: "Inversor sem comunicação", uc: "9999555001", origem: { canal: "whatsapp", grupo: "WhatsApp Técnicos", solicitante: "Técnico" } };
  const postar = (quem: string) => http().post("/agentes/engenharia/ordens-de-servico").set("Authorization", `Bearer ${token(quem)}`).set("Idempotency-Key", "pedido-0001");

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OrdensPeloAgenteService).useValue(servico)
      .overrideProvider(AgentLookupRepository).useValue(lookup)
      .compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("só o agente com a ação e a tela de O.S.; pessoa e agente sem a ação levam 403", async () => {
    servico.criar.mockResolvedValue({ criada: true, resposta: { ordem: { id: OS, codigo: "OS-0001", situacao: "aberta", prazo: "2026-11-26" }, repetido: false } });
    await http().post("/agentes/engenharia/ordens-de-servico").send(corpo).expect(401);
    await postar("semAcao").send(corpo).expect(403);
    await postar("crm").send(corpo).expect(403);
    await http().post("/agentes/engenharia/ordens-de-servico").set("x-dev-principal", "00000000-0000-4000-8000-000000000001").set("x-dev-departamentos", "engenharia-obras:gerente").send(corpo).expect(403);
    expect(servico.criar).not.toHaveBeenCalled();
    const criada = await postar("robo").send(corpo).expect(201);
    expect(criada.body).toMatchObject({ repetido: false, ordem: { id: OS } });
    expect(servico.criar).toHaveBeenCalledWith("pedido-0001", expect.objectContaining({ uc: "9999555001", origem: expect.objectContaining({ canal: "whatsapp" }) }), expect.objectContaining({ id: AGENTE, kind: "service" }));
  });

  it("o pedido repetido responde 200; o corpo é validado antes do serviço", async () => {
    servico.criar.mockResolvedValue({ criada: false, resposta: { ordem: { id: OS, codigo: "OS-0001", situacao: "aberta", prazo: "2026-11-26" }, repetido: true } });
    await postar("robo").send(corpo).expect(200);
    servico.criar.mockClear();
    await postar("robo").send({ ...corpo, origem: { ...corpo.origem, canal: "email" } }).expect(400);
    await postar("robo").send({ ...corpo, clienteNome: "Fulano" }).expect(400);
    await postar("robo").send({ ...corpo, documento: "123" }).expect(400);
    expect(servico.criar).not.toHaveBeenCalled();
  });

  it("com o portão da Engenharia fechado, responde 404 antes da sessão", async () => {
    const config = app.get(ConfigService);
    const original = config.get.bind(config);
    const espiao = vi.spyOn(config, "get").mockImplementation(((chave: string, ...resto: unknown[]) =>
      chave === "ENGENHARIA_LIGADA" ? false : (original as (k: string, ...r: unknown[]) => unknown)(chave, ...resto)) as typeof config.get);
    try {
      await postar("robo").send(corpo).expect(404);
      await http().post("/agentes/engenharia/ordens-de-servico").expect(404);
    } finally {
      espiao.mockRestore();
    }
  });
});
