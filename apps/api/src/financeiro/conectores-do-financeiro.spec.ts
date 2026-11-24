import { opcoesDoFinanceiroSchema } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { type ConectorDoFinanceiro, ConectoresDoFinanceiro } from "./conectores-do-financeiro";

const tx = {} as never;
const omie = (plugga: boolean, waze: boolean): ConectorDoFinanceiro => ({ chave: "omie", conexoes: async () => ({ plugga, waze }) });
const OPCOES = { categorias: [], contasCorrentes: [], fornecedores: [], formasDePagamento: [] };

describe("conectores do Financeiro", () => {
  it("sem conector inscrito, as opções não trazem conectores e o contrato aceita", async () => {
    const conectores = new ConectoresDoFinanceiro();
    expect(await conectores.conexoes(tx)).toBeUndefined();
    expect(opcoesDoFinanceiroSchema.parse(OPCOES)).not.toHaveProperty("conectores");
  });

  it("com o conector inscrito, cada empresa diz se está conectada; a segunda inscrição do mesmo conector não conta", async () => {
    const conectores = new ConectoresDoFinanceiro();
    conectores.inscrever(omie(true, false));
    conectores.inscrever(omie(false, false));
    const conexoes = await conectores.conexoes(tx);
    expect(conexoes).toEqual({ omie: { plugga: true, waze: false } });
    expect(opcoesDoFinanceiroSchema.parse({ ...OPCOES, conectores: conexoes }).conectores).toEqual({ omie: { plugga: true, waze: false } });
  });

  it("o contrato exige as duas empresas no conector", () => {
    expect(() => opcoesDoFinanceiroSchema.parse({ ...OPCOES, conectores: { omie: { plugga: true } } })).toThrow();
  });
});
