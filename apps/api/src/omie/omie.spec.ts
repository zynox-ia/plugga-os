import { randomBytes } from "node:crypto";

import { entradaDoOmieSchema, type EntradaDoOmie } from "@plugga/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditPort } from "../audit/audit.port";
import { SegredoRepository, type GravarSegredo, type SegredoGuardado } from "../llm/segredo.repository.js";
import { OmieCofreService, OmieLeitura, type MaterialCifrado } from "./omie-cofre.service";
import { OmieHttpAdapter } from "./omie-http.adapter";
import { OmieFalhouError, OmiePort } from "./omie.port";

/**
 * OMIE: uma conta só para a plataforma. Garantias: o segredo nunca volta para a
 * tela nem para o log; conectar e desconectar são auditados sem o segredo; linha
 * ilegível não derruba quem usa a conta; e o adaptador traduz cada resposta do OMIE
 * em um motivo curto, sem repassar mensagem nem credencial.
 */

class CofreEmMemoria extends SegredoRepository {
  linha: SegredoGuardado | null = null;
  async buscar(): Promise<SegredoGuardado | null> { return this.linha; }
  async gravar(d: GravarSegredo): Promise<void> { this.linha = { ...d, atualizadoEm: new Date("2026-11-13T10:00:00Z") }; }
  async apagar(): Promise<void> { this.linha = null; }
}

class LeituraDoCofre extends OmieLeitura {
  constructor(private readonly cofre: CofreEmMemoria) { super(); }
  async lerCifrado(): Promise<MaterialCifrado | null> {
    const l = this.cofre.linha;
    return l ? { valorCifrado: l.valorCifrado, iv: l.iv, tag: l.tag } : null;
  }
}

const APP_KEY = "1234567890123";
const APP_SECRET = "segredo-do-app-omie-para-teste-abcdef0123456789";
const ENTRADA: EntradaDoOmie = { appKey: APP_KEY, appSecret: APP_SECRET };

function montar() {
  const cofre = new CofreEmMemoria();
  const omie = { consultarEmpresa: vi.fn(async () => ({ razaoSocial: "PLUGGA LTDA", nomeFantasia: "Plugga", cnpj: "11222333000181" })) };
  const eventos: { eventName: string; actorId: string | null; payload: unknown }[] = [];
  const auditoria = { appendEvent: vi.fn(async (e: { eventName: string; actorId: string | null; payload: unknown }) => { eventos.push(e); }), appendTrail: vi.fn() } as unknown as AuditPort;
  const servico = new OmieCofreService(cofre, new LeituraDoCofre(cofre), omie as unknown as OmiePort, auditoria);
  return { servico, cofre, omie, eventos };
}

const mestraAnterior = process.env.SECRETS_ENCRYPTION_KEY;
beforeEach(() => { process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64"); });
afterEach(() => {
  vi.unstubAllGlobals();
  if (mestraAnterior === undefined) delete process.env.SECRETS_ENCRYPTION_KEY;
  else process.env.SECRETS_ENCRYPTION_KEY = mestraAnterior;
});

describe("OMIE no cofre", () => {
  it("guarda cifrado e entrega chave e segredo ao uso da conta", async () => {
    const { servico, cofre } = montar();

    await servico.gravar(ENTRADA, "dev");

    expect(cofre.linha?.valorCifrado).not.toContain("segredo-do-app");
    expect(cofre.linha?.valorCifrado).not.toContain(APP_KEY);
    expect(await servico.credenciais()).toEqual(ENTRADA);
  });

  it("não devolve o segredo para a tela, só os quatro últimos da chave", async () => {
    const { servico } = montar();

    const estado = await servico.gravar(ENTRADA, "dev-1");

    expect(estado).toMatchObject({ conectado: true, origem: "cofre", mascara: "••••0123", atualizadoPor: "dev-1" });
    expect(JSON.stringify(estado)).not.toContain("segredo-do-app");
    expect(JSON.stringify(estado)).not.toContain(APP_KEY);
  });

  it("sem nada no cofre, está desconectado", async () => {
    expect(await montar().servico.estado()).toMatchObject({ conectado: false, origem: "nenhuma", mascara: null });
  });

  it("desconectar apaga e para de entregar credenciais", async () => {
    const { servico } = montar();
    await servico.gravar(ENTRADA, "dev");

    expect((await servico.apagar("dev")).conectado).toBe(false);
    expect(await servico.credenciais()).toBeNull();
  });

  it("audita conectar e desconectar sem a chave nem o segredo", async () => {
    const { servico, eventos } = montar();

    await servico.gravar(ENTRADA, "dev-1");
    await servico.apagar("dev-1");

    expect(eventos.map((e) => e.eventName)).toEqual(["integracao.omie.connected", "integracao.omie.disconnected"]);
    expect(JSON.stringify(eventos)).not.toContain("segredo-do-app");
    expect(JSON.stringify(eventos)).not.toContain(APP_KEY);
  });

  it("segredo que não decifra mais: desconectado, sem derrubar o uso", async () => {
    const { servico, cofre } = montar();
    await servico.gravar(ENTRADA, "dev");
    process.env.SECRETS_ENCRYPTION_KEY = randomBytes(32).toString("base64");

    const outro = new OmieCofreService(cofre, new LeituraDoCofre(cofre), { consultarEmpresa: vi.fn() } as unknown as OmiePort, { appendEvent: vi.fn(), appendTrail: vi.fn() } as unknown as AuditPort);

    expect(await outro.credenciais()).toBeNull();
    expect(await outro.estado()).toMatchObject({ conectado: false, origem: "cofre_ilegivel" });
  });

  it("o teste usa a conta conectada; sem conta, recusa", async () => {
    const { servico, omie } = montar();
    await expect(servico.testar()).rejects.toThrow(/não está conectada/);

    await servico.gravar(ENTRADA, "dev");

    expect(await servico.testar()).toEqual({ razaoSocial: "PLUGGA LTDA", nomeFantasia: "Plugga", cnpj: "11222333000181" });
    expect(omie.consultarEmpresa).toHaveBeenCalledWith(ENTRADA);
  });

  it("a troca pela tela vale na hora, sem esperar o cache", async () => {
    const { servico } = montar();
    await servico.gravar(ENTRADA, "dev");
    expect((await servico.credenciais())?.appKey).toBe(APP_KEY);

    await servico.gravar({ ...ENTRADA, appKey: "9999999999999" }, "dev");

    expect((await servico.credenciais())?.appKey).toBe("9999999999999");
  });
});

describe("entrada do OMIE", () => {
  it("aceita chave e segredo e tira espaços das pontas", () => {
    expect(entradaDoOmieSchema.parse({ appKey: ` ${APP_KEY} `, appSecret: ` ${APP_SECRET}\n` })).toEqual(ENTRADA);
  });

  it("recusa valor curto, com espaço no meio ou campo a mais, com motivo em português", () => {
    const motivo = (e: unknown) => {
      const r = entradaDoOmieSchema.safeParse(e);
      return r.success ? null : r.error.issues[0]?.message;
    };
    expect(motivo({ appKey: "123", appSecret: APP_SECRET })).toMatch(/maior que isso/);
    expect(motivo({ appKey: APP_KEY, appSecret: "curto" })).toMatch(/maior que isso/);
    expect(motivo({ appKey: "123 456 789", appSecret: APP_SECRET })).toMatch(/espaços/);
    expect(entradaDoOmieSchema.safeParse({ ...ENTRADA, extra: 1 }).success).toBe(false);
  });
});

describe("OmieHttpAdapter", () => {
  const responder = (status: number, corpo: unknown = {}) => {
    const mock = vi.fn<typeof fetch>(async () => new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status }));
    vi.stubGlobal("fetch", mock);
    return mock;
  };
  const motivo = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as OmieFalhouError).motivo;
  const consultar = () => new OmieHttpAdapter().consultarEmpresa(ENTRADA);

  it("chama ListarEmpresas com as credenciais no corpo e devolve a empresa dona da conta", async () => {
    const chamada = responder(200, { pagina: 1, empresas_cadastro: [{ codigo_empresa: 1, cnpj: "11.222.333/0001-81", razao_social: "PLUGGA LTDA", nome_fantasia: "Plugga", email: "x@y.z" }] });

    expect(await consultar()).toEqual({ razaoSocial: "PLUGGA LTDA", nomeFantasia: "Plugga", cnpj: "11222333000181" });
    const [url, init] = chamada.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://app.omie.com.br/api/v1/geral/empresas/");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ call: "ListarEmpresas", app_key: APP_KEY, app_secret: APP_SECRET, param: [{ pagina: 1, registros_por_pagina: 1 }] });
  });

  it("conta sem empresa listada ainda confirma as credenciais", async () => {
    responder(200, { empresas_cadastro: [] });
    expect(await consultar()).toEqual({ razaoSocial: null, nomeFantasia: null, cnpj: null });
  });

  it("traduz cada falha em um motivo curto", async () => {
    responder(500, { faultstring: "ERROR: Application key or secret invalid", faultcode: "SOAP-ENV:Client-102" });
    expect(await motivo(consultar())).toBe("credenciais_invalidas");
    responder(500, { faultstring: "Consumo redundante detectado, bloqueado temporariamente", faultcode: "x" });
    expect(await motivo(consultar())).toBe("limite_de_consumo");
    responder(500, { faultstring: "Falha qualquer", faultcode: "x" });
    expect(await motivo(consultar())).toBe("recusada");
    responder(429);
    expect(await motivo(consultar())).toBe("limite_de_consumo");
    responder(401);
    expect(await motivo(consultar())).toBe("credenciais_invalidas");
    responder(503, "<html>fora do ar</html>");
    expect(await motivo(consultar())).toBe("indisponivel");
    responder(200, { sem: "empresas" });
    expect(await motivo(consultar())).toBe("resposta_inesperada");
    responder(200, "não é json");
    expect(await motivo(consultar())).toBe("resposta_inesperada");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await motivo(consultar())).toBe("indisponivel");
  });

  it("o erro nunca carrega a chave, o segredo nem a mensagem do OMIE", async () => {
    responder(500, { faultstring: `chave ${APP_KEY} segredo ${APP_SECRET} inválidos`, faultcode: "x" });
    const erro = (await consultar().then(() => null, (e: unknown) => e)) as Error;

    const tudo = `${erro.message} ${erro.stack ?? ""}`;
    expect(tudo).not.toContain(APP_KEY);
    expect(tudo).not.toContain(APP_SECRET);
    expect(tudo).not.toContain("inválidos");
  });
});
