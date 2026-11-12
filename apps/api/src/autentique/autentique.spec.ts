import { randomBytes } from "node:crypto";

import type { CompanyKey, EntradaDaAutentique } from "@plugga/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditPort } from "../audit/audit.port";
import { SegredoRepository, type GravarSegredo, type SegredoGuardado } from "../llm/segredo.repository.js";
import { AutentiqueCofreService, AutentiqueLeitura, chaveDaAutentique, type MaterialCifrado } from "./autentique-cofre.service";
import { AutentiqueHttpAdapter } from "./autentique-http.adapter";
import { AutentiqueFalhouError, AutentiquePort } from "./autentique.port";

/**
 * Autentique com uma conta por empresa. Garantias: a Plugga e a Waze Energia não
 * se misturam; o token nunca volta para a tela nem para o log; conectar e
 * desconectar são auditados com a empresa e sem o token; e linha ilegível de
 * uma empresa não derruba a outra.
 */

class CofreEmMemoria extends SegredoRepository {
  linhas = new Map<string, SegredoGuardado>();
  async buscar(chave: string): Promise<SegredoGuardado | null> { return this.linhas.get(chave) ?? null; }
  async gravar(d: GravarSegredo): Promise<void> { this.linhas.set(d.chave, { ...d, atualizadoEm: new Date("2026-11-13T10:00:00Z") }); }
  async apagar(chave: string): Promise<void> { this.linhas.delete(chave); }
}

class LeituraDoCofre extends AutentiqueLeitura {
  constructor(private readonly cofre: CofreEmMemoria) { super(); }
  async lerCifrado(empresa: CompanyKey): Promise<MaterialCifrado | null> {
    const l = this.cofre.linhas.get(chaveDaAutentique(empresa));
    return l ? { valorCifrado: l.valorCifrado, iv: l.iv, tag: l.tag } : null;
  }
}

const TOKEN_PLUGGA = "token-da-plugga-para-teste-0000000001111";
const TOKEN_WAZE = "token-da-waze-para-teste-00000000022222";
const PLUGGA: EntradaDaAutentique = { token: TOKEN_PLUGGA, sandbox: true };
const WAZE: EntradaDaAutentique = { token: TOKEN_WAZE, sandbox: false };

function montar() {
  const cofre = new CofreEmMemoria();
  const consultas: string[] = [];
  const autentique = { consultarConta: vi.fn(async (token: string) => { consultas.push(token); return { nome: "Dona da Conta", email: "conta@teste.local" }; }) };
  const eventos: { eventName: string; entityId: string | null; actorId: string | null; payload: unknown }[] = [];
  const auditoria = { appendEvent: vi.fn(async (e: { eventName: string; entityId: string | null; actorId: string | null; payload: unknown }) => { eventos.push(e); }), appendTrail: vi.fn() } as unknown as AuditPort;
  const servico = new AutentiqueCofreService(cofre, new LeituraDoCofre(cofre), autentique as unknown as AutentiquePort, auditoria);
  return { servico, cofre, autentique, consultas, eventos };
}

const mestraAnterior = process.env.SECRETS_ENCRYPTION_KEY;
beforeEach(() => { process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64"); });
afterEach(() => {
  vi.unstubAllGlobals();
  if (mestraAnterior === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = mestraAnterior;
});

describe("Autentique, uma conta por empresa", () => {
  it("cada empresa tem a sua conta e uma não enxerga a outra", async () => {
    const { servico } = montar();

    await servico.gravar("plugga", PLUGGA, "dev");
    await servico.gravar("waze", WAZE, "dev");

    expect(await servico.credenciais("plugga")).toEqual(PLUGGA);
    expect(await servico.credenciais("waze")).toEqual(WAZE);
  });

  it("conectar só a Plugga deixa a Waze Energia desconectada", async () => {
    const { servico } = montar();

    const estado = await servico.gravar("plugga", PLUGGA, "dev");

    expect(estado.contas.map((c) => [c.empresa, c.conectada])).toEqual([["plugga", true], ["waze", false]]);
    expect(await servico.credenciais("waze")).toBeNull();
  });

  it("guarda cifrado, em uma linha por empresa", async () => {
    const { servico, cofre } = montar();
    await servico.gravar("plugga", PLUGGA, "dev");
    await servico.gravar("waze", WAZE, "dev");

    expect([...cofre.linhas.keys()].sort()).toEqual(["integracao.autentique.plugga", "integracao.autentique.waze"]);
    for (const linha of cofre.linhas.values()) expect(linha.valorCifrado).not.toContain("token-da-");
  });

  it("não devolve o token para a tela, só os quatro últimos e o modo", async () => {
    const { servico } = montar();

    const estado = await servico.gravar("plugga", PLUGGA, "dev-1");

    expect(estado.contas[0]).toMatchObject({ empresa: "plugga", conectada: true, origem: "cofre", mascara: "••••1111", sandbox: true, atualizadoPor: "dev-1" });
    expect(JSON.stringify(estado)).not.toContain("token-da-");
  });

  it("desconectar uma empresa não mexe na outra", async () => {
    const { servico } = montar();
    await servico.gravar("plugga", PLUGGA, "dev");
    await servico.gravar("waze", WAZE, "dev");

    const estado = await servico.apagar("plugga", "dev");

    expect(estado.contas.map((c) => [c.empresa, c.conectada])).toEqual([["plugga", false], ["waze", true]]);
    expect(await servico.credenciais("plugga")).toBeNull();
    expect((await servico.credenciais("waze"))?.token).toBe(TOKEN_WAZE);
  });

  it("o teste usa o token da empresa pedida e de nenhuma outra", async () => {
    const { servico, consultas } = montar();
    await servico.gravar("plugga", PLUGGA, "dev");
    await servico.gravar("waze", WAZE, "dev");

    expect(await servico.testar("waze")).toEqual({ nome: "Dona da Conta", email: "conta@teste.local" });
    expect(consultas).toEqual([TOKEN_WAZE]);
    await servico.apagar("waze", "dev");
    await expect(servico.testar("waze")).rejects.toThrow(/não está conectada/);
  });

  it("audita conectar e desconectar com a empresa e sem o token", async () => {
    const { servico, eventos } = montar();

    await servico.gravar("waze", WAZE, "dev-1");
    await servico.apagar("waze", "dev-1");

    expect(eventos.map((e) => e.eventName)).toEqual(["integracao.autentique.connected", "integracao.autentique.disconnected"]);
    expect(eventos.every((e) => e.entityId === "integracao.autentique.waze" && JSON.stringify(e.payload) === '{"empresa":"waze"}')).toBe(true);
    expect(JSON.stringify(eventos)).not.toContain("token-da-");
  });

  it("a troca pela tela vale na hora, sem esperar o cache", async () => {
    const { servico } = montar();
    await servico.gravar("plugga", PLUGGA, "dev");
    expect((await servico.credenciais("plugga"))?.sandbox).toBe(true);

    await servico.gravar("plugga", { ...PLUGGA, sandbox: false }, "dev");

    expect((await servico.credenciais("plugga"))?.sandbox).toBe(false);
  });

  it("segredo que não decifra mais numa empresa não derruba a outra", async () => {
    const { servico, cofre } = montar();
    await servico.gravar("plugga", PLUGGA, "dev");
    cofre.linhas.set(chaveDaAutentique("waze"), { valorCifrado: "lixo", iv: "lixo", tag: "lixo", ultimosQuatro: "xxxx", atualizadoPor: "dev", atualizadoEm: new Date() });

    const novo = new AutentiqueCofreService(cofre, new LeituraDoCofre(cofre), { consultarConta: vi.fn() } as unknown as AutentiquePort, { appendEvent: vi.fn(), appendTrail: vi.fn() } as unknown as AuditPort);
    const estado = await novo.estado();

    expect(estado.contas.map((c) => [c.empresa, c.conectada, c.origem])).toEqual([["plugga", true, "cofre"], ["waze", false, "cofre_ilegivel"]]);
    expect(await novo.credenciais("waze")).toBeNull();
    expect((await novo.credenciais("plugga"))?.token).toBe(TOKEN_PLUGGA);
  });
});

describe("AutentiqueHttpAdapter", () => {
  const responder = (status: number, corpo: unknown = {}) => {
    const mock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(corpo), { status }));
    vi.stubGlobal("fetch", mock);
    return mock;
  };
  const motivo = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as AutentiqueFalhouError).motivo;

  it("confirma a conta pelo usuário dono do token", async () => {
    const chamada = responder(200, { data: { me: { name: "Maria", email: "maria@teste.local" } } });

    expect(await new AutentiqueHttpAdapter().consultarConta(TOKEN_PLUGGA)).toEqual({ nome: "Maria", email: "maria@teste.local" });
    const [url, init] = chamada.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.autentique.com.br/v2/graphql");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN_PLUGGA}`);
  });

  it("traduz cada falha em um motivo curto", async () => {
    responder(401);
    expect(await motivo(new AutentiqueHttpAdapter().consultarConta(TOKEN_PLUGGA))).toBe("token_invalido");
    responder(403);
    expect(await motivo(new AutentiqueHttpAdapter().consultarConta(TOKEN_PLUGGA))).toBe("token_invalido");
    responder(429);
    expect(await motivo(new AutentiqueHttpAdapter().consultarConta(TOKEN_PLUGGA))).toBe("limite_de_envio");
    responder(500);
    expect(await motivo(new AutentiqueHttpAdapter().consultarConta(TOKEN_PLUGGA))).toBe("indisponivel");
    responder(200, { data: { me: null }, errors: [{ message: "Unauthenticated" }] });
    expect(await motivo(new AutentiqueHttpAdapter().consultarConta(TOKEN_PLUGGA))).toBe("resposta_inesperada");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await motivo(new AutentiqueHttpAdapter().consultarConta(TOKEN_PLUGGA))).toBe("indisponivel");
  });

  it("o erro nunca carrega o token nem o corpo da resposta", async () => {
    responder(401, { errors: [{ message: `Bearer ${TOKEN_PLUGGA} inválido` }] });
    const erro = (await new AutentiqueHttpAdapter().consultarConta(TOKEN_PLUGGA).then(() => null, (e: unknown) => e)) as Error;

    expect(`${erro.message} ${erro.stack ?? ""}`).not.toContain(TOKEN_PLUGGA);
  });
});
