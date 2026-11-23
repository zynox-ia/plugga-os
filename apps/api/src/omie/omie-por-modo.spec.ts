import type { IntegrationMode } from "@plugga/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IntegrationGate } from "../integrations/integration-gate";
import { OmieDubleAdapter } from "./omie-duble.adapter";
import { OmieHttpAdapter } from "./omie-http.adapter";
import { OmiePorModoAdapter, adaptadorPara } from "./omie-por-modo.adapter";
import { OmieFalhouError } from "./omie.port";

const SINTETICA = { appKey: "sintetico-99999002000103", appSecret: "segredo-sintetico-qualquer" };
const REAL = { appKey: "chave-de-verdade-2311", appSecret: "segredo-de-verdade-0000" };
const porta = (modo: IntegrationMode | null) =>
  new OmiePorModoAdapter({ modoDe: async () => modo ?? "mock" } as unknown as IntegrationGate, new OmieHttpAdapter(), new OmieDubleAdapter());

describe("adaptadorPara", () => {
  it("mock: só o dublê; read_only: lê de verdade e nunca escreve; write: lê e escreve", () => {
    expect([adaptadorPara("mock", "leitura"), adaptadorPara("mock", "escrita")]).toEqual(["duble", "duble"]);
    expect([adaptadorPara("read_only", "leitura"), adaptadorPara("read_only", "escrita")]).toEqual(["http", "duble"]);
    expect([adaptadorPara("write", "leitura"), adaptadorPara("write", "escrita")]).toEqual(["http", "http"]);
  });
});

describe("OmiePorModoAdapter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("em mock (e sem registro), nenhuma requisição HTTP sai, nem com chave de verdade", async () => {
    const rede = vi.spyOn(globalThis, "fetch");
    for (const modo of ["mock", null] as const) {
      await expect(porta(modo).listarEmpresas(REAL)).rejects.toMatchObject({ motivo: "modo_mock" });
      await expect(porta(modo).consultarEmpresa(REAL)).rejects.toBeInstanceOf(OmieFalhouError);
      expect(await porta(modo).listarEmpresas(SINTETICA)).toEqual([expect.objectContaining({ cnpj: "99999002000103" })]);
    }
    expect(rede).not.toHaveBeenCalled();
  });

  it("em read_only e write, a leitura sai para o OMIE (aqui, um fetch dublê)", async () => {
    const rede = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ empresas_cadastro: [{ cnpj: "99.999.001/0001-59", razao_social: "X" }] }), { status: 200 }));
    for (const modo of ["read_only", "write"] as const) {
      expect(await porta(modo).listarEmpresas(REAL)).toEqual([expect.objectContaining({ cnpj: "99999001000159" })]);
    }
    expect(rede).toHaveBeenCalledTimes(2);
    expect(String(rede.mock.calls[0]![0])).toContain("app.omie.com.br");
  });

  it("o dublê: chave sintética sem CNPJ vale a empresa sintética padrão", async () => {
    expect(await new OmieDubleAdapter().listarEmpresas({ appKey: "sintetico-abc", appSecret: "x".repeat(16) })).toEqual([expect.objectContaining({ cnpj: "99999001000159" })]);
  });
});
