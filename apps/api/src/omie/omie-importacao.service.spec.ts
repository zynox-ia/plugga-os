import { describe, expect, it, vi } from "vitest";

import { OmieImportacaoService } from "./omie-importacao.service";

const conferencia = { categorias: { itens: [], resumo: { iguais: 0, novasNoOmie: 0, vinculaveis: 0, diferentes: 0, soNoPlugga: 0 } }, contas: { itens: [], resumo: { iguais: 0, novasNoOmie: 0, vinculaveis: 0, diferentes: 0, soNoPlugga: 0 } } };
const contagem = { categorias: { criadas: 0, vinculadas: 0, paraClassificar: 0 }, contasCorrentes: { criadas: 0, vinculadas: 0 } };
const principal = { id: "00000000-0000-4000-8000-000000000001", kind: "user" } as never;

const montar = (credenciais: unknown = { appKey: "sintetico-1", appSecret: "x" }) => {
  const omie = { listarCategorias: vi.fn().mockResolvedValue([]), listarContasCorrentes: vi.fn().mockResolvedValue([]) };
  const conexoes = { credenciais: vi.fn().mockResolvedValue(credenciais) };
  const repositorio = { conferir: vi.fn().mockResolvedValue(conferencia), importar: vi.fn().mockResolvedValue(contagem) };
  return { omie, conexoes, servico: new OmieImportacaoService(conexoes as never, omie as never, repositorio as never) };
};
const em = (segundos: number) => new Date(Date.UTC(2026, 10, 24, 15, 0, segundos));

describe("leitura do OMIE para conferir e importar (S4): sem consulta repetida em menos de 60 s", () => {
  it("conferir e importar em seguida lê o OMIE uma vez só", async () => {
    const { omie, servico } = montar();
    await servico.conferir("waze", em(0));
    await servico.importar("waze", principal, em(40));
    expect(omie.listarCategorias).toHaveBeenCalledTimes(1);
    expect(omie.listarContasCorrentes).toHaveBeenCalledTimes(1);
  });

  it("conferir de novo em menos de 1 min reaproveita; depois disso, lê de novo", async () => {
    const { omie, servico } = montar();
    await servico.conferir("waze", em(0));
    await servico.conferir("waze", em(30));
    expect(omie.listarCategorias).toHaveBeenCalledTimes(1);
    await servico.conferir("waze", em(61));
    expect(omie.listarCategorias).toHaveBeenCalledTimes(2);
  });

  it("a importação usa a leitura de até 5 min; mais velha, lê de novo; cada empresa tem a sua", async () => {
    const { omie, servico } = montar();
    await servico.conferir("waze", em(0));
    await servico.importar("waze", principal, em(299));
    expect(omie.listarCategorias).toHaveBeenCalledTimes(1);
    await servico.importar("plugga", principal, em(299));
    expect(omie.listarCategorias).toHaveBeenCalledTimes(2);
    await servico.importar("waze", principal, em(301 + 299));
    expect(omie.listarCategorias).toHaveBeenCalledTimes(3);
  });

  it("trocar o par não usa a leitura do par antigo; o lidoEm é o da leitura de fato", async () => {
    const { omie, conexoes, servico } = montar();
    const primeira = await servico.conferir("waze", em(0));
    expect((await servico.conferir("waze", em(30))).lidoEm).toBe(primeira.lidoEm);
    conexoes.credenciais.mockResolvedValue({ appKey: "sintetico-2", appSecret: "x" });
    await servico.importar("waze", principal, em(40));
    expect(omie.listarCategorias).toHaveBeenCalledTimes(2);
  });

  it("sem a conexão confirmada, nada vale, nem a leitura guardada", async () => {
    const { conexoes, servico } = montar();
    await servico.conferir("waze", em(0));
    conexoes.credenciais.mockResolvedValue(null);
    await expect(servico.importar("waze", principal, em(10))).rejects.toMatchObject({ message: "Conecte o OMIE da Waze antes de importar." });
  });
});
