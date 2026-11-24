import { afterEach, describe, expect, it, vi } from "vitest";

import { SEM_GRUPO, espelhoDasCategorias, espelhoDasContas } from "./omie-cadastros.rules";
import { OmieDubleAdapter } from "./omie-duble.adapter";
import { OmieHttpAdapter } from "./omie-http.adapter";
import { OmieFalhouError } from "./omie.port";

const PAR = { appKey: "chave-ficticia-0001", appSecret: "ficticio-ficticio-ficticio" };

afterEach(() => vi.unstubAllGlobals());

/** Uma resposta por chamada, na ordem. */
function responderEmSequencia(...corpos: unknown[]) {
  const mock = vi.fn<typeof fetch>(async () => {
    const corpo = corpos.shift();
    return new Response(JSON.stringify(corpo ?? {}), { status: 200 });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
const parametros = (mock: ReturnType<typeof responderEmSequencia>, i: number) => JSON.parse(mock.mock.calls[i]![1]!.body as string) as { call: string; param: Record<string, unknown>[] };
const motivo = async (p: Promise<unknown>) => ((await p.then(() => null, (e: unknown) => e)) as OmieFalhouError).motivo;

describe("leitura dos cadastros do OMIE (PLU-342)", () => {
  it("ListarCategorias percorre todas as páginas e traduz cada categoria", async () => {
    const chamadas = responderEmSequencia(
      { pagina: 1, total_de_paginas: 2, registros: 2, total_de_registros: 3, categoria_cadastro: [
        { codigo: "2.01", descricao: "Despesas operacionais", totalizadora: "S", conta_despesa: "S", conta_inativa: "N" },
        { codigo: "2.01.01", descricao: "Serviços de terceiros", categoria_superior: "2.01", conta_despesa: "S", conta_receita: "N", conta_inativa: "N", nao_exibir: "N" },
      ] },
      { pagina: 2, total_de_paginas: 2, registros: 1, total_de_registros: 3, categoria_cadastro: [
        { codigo: "2.01.02", descricao: "Antiga", categoria_superior: "2.01", conta_despesa: "S", conta_inativa: "S" },
      ] },
    );
    const lidas = await new OmieHttpAdapter().listarCategorias(PAR);
    expect(lidas.map((c) => `${c.codigo}:${c.totalizadora ? "grupo" : c.grupo}:${c.ativa}`)).toEqual(["2.01:grupo:true", "2.01.01:2.01:true", "2.01.02:2.01:false"]);
    expect(chamadas.mock.calls[0]![0]).toBe("https://app.omie.com.br/api/v1/geral/categorias/");
    expect(parametros(chamadas, 0)).toMatchObject({ call: "ListarCategorias", param: [{ pagina: 1, registros_por_pagina: 50 }] });
    expect(parametros(chamadas, 1).param[0]).toMatchObject({ pagina: 2 });
  });

  it("ListarContasCorrentes lê a lista de mesmo nome, com o código numérico como texto", async () => {
    const chamadas = responderEmSequencia({ pagina: 1, total_de_paginas: 1, ListarContasCorrentes: [
      { nCodCC: 99990001, descricao: "Conta sintética", codigo_banco: "999", codigo_agencia: "9999", numero_conta_corrente: "99990-1", inativo: "N" },
      { nCodCC: 99990002, descricao: "Encerrada", inativo: "S" },
    ] });
    expect(await new OmieHttpAdapter().listarContasCorrentes(PAR)).toEqual([
      { codigo: "99990001", descricao: "Conta sintética", banco: "999", agencia: "9999", numero: "99990-1", ativa: true },
      { codigo: "99990002", descricao: "Encerrada", banco: null, agencia: null, numero: null, ativa: false },
    ]);
    expect(chamadas.mock.calls[0]![0]).toBe("https://app.omie.com.br/api/v1/geral/contacorrente/");
    expect(parametros(chamadas, 0)).toMatchObject({ call: "ListarContasCorrentes", param: [{ apenas_importado_api: "N", pagina: 1, registros_por_pagina: 50 }] });
  });

  it("resposta sem a lista ou sem o total de páginas é inesperada; a falha do OMIE vira motivo curto", async () => {
    responderEmSequencia({ pagina: 1, categoria_cadastro: [] });
    expect(await motivo(new OmieHttpAdapter().listarCategorias(PAR))).toBe("resposta_inesperada");
    responderEmSequencia({ pagina: 1, total_de_paginas: 1 });
    expect(await motivo(new OmieHttpAdapter().listarContasCorrentes(PAR))).toBe("resposta_inesperada");
    responderEmSequencia({ faultstring: "ERROR: Application key or secret invalid", faultcode: "x" });
    expect(await motivo(new OmieHttpAdapter().listarCategorias(PAR))).toBe("credenciais_invalidas");
  });

  it("um plano de contas além do teto de páginas é recusado em vez de ler sem fim", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ total_de_paginas: 999, categoria_cadastro: [] }), { status: 200 })));
    expect(await motivo(new OmieHttpAdapter().listarCategorias(PAR))).toBe("resposta_inesperada");
  });

  it("o dublê só responde à chave sintética", async () => {
    const duble = new OmieDubleAdapter();
    expect((await duble.listarCategorias({ ...PAR, appKey: "sintetico-1" })).length).toBeGreaterThan(0);
    expect((await duble.listarContasCorrentes({ ...PAR, appKey: "sintetico-1" })).length).toBeGreaterThan(0);
    expect(await motivo(duble.listarCategorias(PAR))).toBe("modo_mock");
  });

  it("o espelho guarda só as categorias que recebem lançamento, com o nome do grupo", async () => {
    const lidas = await new OmieDubleAdapter().listarCategorias({ ...PAR, appKey: "sintetico-1" });
    const espelho = espelhoDasCategorias(lidas);
    expect(espelho.map((c) => c.codigo)).toEqual(["1.01.01", "1.01.02", "2.01.01", "2.01.02"]);
    expect(espelho.find((c) => c.codigo === "2.01.01")).toEqual({ codigo: "2.01.01", nome: "Serviços de terceiros", tipo: "despesa", grupoNome: "Despesas operacionais", ativa: true });
    expect(espelho.find((c) => c.codigo === "1.01.02")).toMatchObject({ tipo: "receita", ativa: false });
    expect(espelhoDasCategorias([{ codigo: "9", descricao: "Solta", grupo: null, receita: false, despesa: true, totalizadora: false, transferencia: false, ativa: true }])[0]?.grupoNome).toBe(SEM_GRUPO);
    expect(espelhoDasContas([{ codigo: "1", descricao: "C", banco: null, agencia: null, numero: null, ativa: true }])).toEqual([{ omieCodigo: "1", nome: "C", banco: null, agencia: null, numero: null, ativa: true }]);
  });
});
