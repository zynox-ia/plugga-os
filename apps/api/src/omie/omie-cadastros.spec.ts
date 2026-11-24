import { afterEach, describe, expect, it, vi } from "vitest";

import { SEM_GRUPO, conferirCategorias, conferirContas, espelhoDasCategorias, espelhoDasContas, type CategoriaDoPlugga, type ContaDoPlugga } from "./omie-cadastros.rules";
import { OmieDubleAdapter } from "./omie-duble.adapter";
import { OmieHttpAdapter } from "./omie-http.adapter";
import { OmieFalhouError, type CategoriaDoOmie, type ContaCorrenteDoOmie } from "./omie.port";

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

describe("conferir com o OMIE (S4): o que cria, o que vincula, e nunca sobrescreve", () => {
  const cat = (codigo: string, descricao: string, o: Partial<CategoriaDoOmie> = {}): CategoriaDoOmie => ({
    codigo, descricao, grupo: "2.01", receita: false, despesa: true, totalizadora: false, transferencia: false, ativa: true, ...o,
  });
  const grupo = cat("2.01", "Despesas operacionais", { totalizadora: true, grupo: null });
  const doPlugga = (id: string, codigo: string, o: Partial<CategoriaDoPlugga> = {}): CategoriaDoPlugga => ({
    id, codigo, nome: "Fretes", tipo: "despesa", ativa: true, grupoNome: "Despesas operacionais", omieCodigo: null, ...o,
  });

  it("vinculada e igual só conta; vinculada e diferente é mostrada, sem nada a fazer", () => {
    const r = conferirCategorias([grupo, cat("2.01.01", "Fretes"), cat("2.01.02", "Combustível")],
      [doPlugga("a", "2.01.01", { omieCodigo: "2.01.01" }), doPlugga("b", "2.01.02", { nome: "Diesel", omieCodigo: "2.01.02", ativa: false })]);
    expect(r.resumo).toEqual({ iguais: 1, novasNoOmie: 0, vinculaveis: 0, diferentes: 1, soNoPlugga: 0 });
    expect(r.itens).toEqual([expect.objectContaining({ situacao: "diferente", diferencas: ["nome", "ativa"], plugga: expect.objectContaining({ id: "b" }) })]);
    expect([r.aCriar, r.aVincular]).toEqual([[], []]);
  });

  it("mesmo código sem vínculo vincula; com outro tipo é diferente e não vincula", () => {
    const r = conferirCategorias([grupo, cat("2.01.01", "Fretes"), cat("1.01.01", "Vendas", { receita: true, despesa: false, grupo: null })],
      [doPlugga("a", "2.01.01"), doPlugga("b", "1.01.01", { nome: "Vendas" })]);
    expect(r.aVincular).toEqual([{ pluggaId: "a", omieCodigo: "2.01.01" }]);
    expect(r.itens.map((i) => [i.situacao, i.plugga?.id, i.diferencas])).toEqual([["vinculavel", "a", []], ["diferente", "b", ["grupoNome", "tipo"]]]);
  });

  it("a nova entra com a natureza padrão e o nome do grupo que o Plugga OS já tem no prefixo; o grupo e a transferência do OMIE não entram", () => {
    const r = conferirCategorias(
      [grupo, cat("2.01.07", "Pedágio"), cat("1.02.01", "Serviços", { receita: true, despesa: false, grupo: null }), cat("9.99", "Transferência", { transferencia: true })],
      [doPlugga("a", "2.01.01", { grupoNome: "Operação", omieCodigo: "2.01.01" })],
    );
    expect(r.aCriar).toEqual([
      { codigo: "2.01.07", nome: "Pedágio", tipo: "despesa", natureza: "outros", grupoNome: "Operação", ativa: true },
      { codigo: "1.02.01", nome: "Serviços", tipo: "receita", natureza: "receita", grupoNome: SEM_GRUPO, ativa: true },
    ]);
    expect(r.resumo).toMatchObject({ novasNoOmie: 2, soNoPlugga: 1 });
    expect(r.itens.find((i) => i.situacao === "so_no_plugga")?.omie).toBeNull();
  });

  const conta = (codigo: string, o: Partial<ContaCorrenteDoOmie> = {}): ContaCorrenteDoOmie => ({ codigo, descricao: "Banco A", banco: "001", agencia: "1234", numero: "5678-9", ativa: true, ...o });
  const contaDoPlugga = (id: string, o: Partial<ContaDoPlugga> = {}): ContaDoPlugga => ({ id, nome: "Banco A", banco: "001", agencia: "1234", numero: "5678-9", omieCodigo: null, ...o });

  it("conta: o vínculo manda; sem ele, banco, agência e número iguais vinculam; incompleta não vincula e entra como nova", () => {
    const r = conferirContas(
      [conta("10"), conta("11", { descricao: "Banco B", numero: "1111-1" }), conta("12", { descricao: "Caixa", banco: null, agencia: null, numero: null })],
      [contaDoPlugga("a", { omieCodigo: "10", nome: "Conta principal" }), contaDoPlugga("b", { numero: "1111-1", nome: "Banco B" }), contaDoPlugga("c", { banco: null, agencia: null, numero: null, nome: "Caixa" })],
    );
    expect(r.itens.map((i) => [i.situacao, i.plugga?.id ?? null, i.diferencas])).toEqual([
      ["diferente", "a", ["nome"]], ["vinculavel", "b", []], ["nova_no_omie", null, []], ["so_no_plugga", "c", []],
    ]);
    expect(r.aVincular).toEqual([{ pluggaId: "b", omieCodigo: "11" }]);
    expect(r.aCriar).toEqual([{ omieCodigo: "12", nome: "Caixa", banco: null, agencia: null, numero: null, ativa: true }]);
  });
});
