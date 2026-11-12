import { afterEach, describe, expect, it, vi } from "vitest";

import { BrasilApiAdapter } from "./brasilapi.adapter";
import { FonteIndisponivelError } from "./consulta-cadastral.port";

function responder(status: number, corpo?: unknown) {
  const mock = vi.fn<typeof fetch>(async () => new Response(corpo === undefined ? null : JSON.stringify(corpo), { status }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

const EMPRESA = {
  razao_social: "PLUGGA TESTE LTDA",
  nome_fantasia: "Plugga",
  descricao_situacao_cadastral: "ATIVA",
  natureza_juridica: "Sociedade Empresária Limitada",
  porte: "DEMAIS",
  data_inicio_atividade: "2020-01-15",
  cnae_fiscal: 4321500,
  cnae_fiscal_descricao: "Instalação e manutenção elétrica",
  ddd_telefone_1: "9232000000",
  email: "contato@plugga.test",
  cep: "69000000",
  logradouro: "AV TESTE",
  numero: "100",
  complemento: "",
  bairro: "CENTRO",
  municipio: "MANAUS",
  uf: "AM",
  campo_que_nao_usamos: "segredo-do-provedor",
};

describe("BrasilApiAdapter", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mapeia só o que o sistema usa e nunca repassa a resposta bruta", async () => {
    const chamada = responder(200, EMPRESA);

    const empresa = await new BrasilApiAdapter().consultarCnpj("11222333000181");

    expect(String(chamada.mock.calls[0]?.[0])).toBe("https://brasilapi.com.br/api/cnpj/v1/11222333000181");
    expect(empresa).toEqual({
      cnpj: "11222333000181",
      razaoSocial: "PLUGGA TESTE LTDA",
      nomeFantasia: "Plugga",
      situacao: "ATIVA",
      naturezaJuridica: "Sociedade Empresária Limitada",
      porte: "DEMAIS",
      abertura: "2020-01-15",
      atividadePrincipal: { codigo: "4321500", descricao: "Instalação e manutenção elétrica" },
      telefone: "9232000000",
      email: "contato@plugga.test",
      endereco: { cep: "69000000", logradouro: "AV TESTE", numero: "100", complemento: null, bairro: "CENTRO", cidade: "MANAUS", uf: "AM" },
    });
    expect(JSON.stringify(empresa)).not.toContain("segredo-do-provedor");
  });

  it("identifica o sistema com User-Agent em toda consulta (sem ele a BrasilAPI responde 403 no CNPJ)", async () => {
    const chamada = responder(200, { razao_social: "X LTDA", cep: "69000000", street: "Rua Teste" });

    await new BrasilApiAdapter().consultarCnpj("11222333000181");
    await new BrasilApiAdapter().consultarCep("69000000");

    for (const [, init] of chamada.mock.calls as [string, RequestInit][]) {
      expect((init.headers as Record<string, string>)["user-agent"]).toMatch(/^Plugga-OS\/\d/);
    }
  });

  it("campo ausente vira null e a consulta continua", async () => {
    responder(200, { razao_social: "SÓ O NOME LTDA" });

    const empresa = await new BrasilApiAdapter().consultarCnpj("11222333000181");

    expect(empresa).toMatchObject({ razaoSocial: "SÓ O NOME LTDA", nomeFantasia: null, atividadePrincipal: null, endereco: null });
  });

  it("404 significa que não existe: devolve null", async () => {
    responder(404, { message: "não encontrado" });
    expect(await new BrasilApiAdapter().consultarCnpj("11222333000181")).toBeNull();
    expect(await new BrasilApiAdapter().consultarCep("69000000")).toBeNull();
  });

  it("falha do provedor, resposta ilegível ou sem razão social são indisponibilidade, não 'não existe'", async () => {
    responder(500);
    await expect(new BrasilApiAdapter().consultarCnpj("11222333000181")).rejects.toThrow(FonteIndisponivelError);

    responder(200, { sem: "razao_social" });
    await expect(new BrasilApiAdapter().consultarCnpj("11222333000181")).rejects.toThrow(/sem razão social/);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
    await expect(new BrasilApiAdapter().consultarCep("69000000")).rejects.toThrow(/ilegível/);
  });

  it("rede caída ou prazo estourado viram indisponibilidade", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(new BrasilApiAdapter().consultarCep("69000000")).rejects.toThrow(FonteIndisponivelError);
  });

  it("mapeia o CEP", async () => {
    responder(200, { cep: "69000000", state: "AM", city: "Manaus", neighborhood: "Centro", street: "Rua Teste" });

    expect(await new BrasilApiAdapter().consultarCep("69000000")).toEqual({
      cep: "69000000", logradouro: "Rua Teste", numero: null, complemento: null, bairro: "Centro", cidade: "Manaus", uf: "AM",
    });
  });
});
