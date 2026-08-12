import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ERRO_HSP_MENSAL,
  premissasDaFicha,
} from "../app/energia-opm/eficiencia/fatura-form-model.ts";

describe("premissas que a tela envia ao motor", () => {
  it("preserva a demanda sem ICMS e exige exatamente doze HSP", () => {
    const formulario = new FormData();
    formulario.set("demandaComplementoValor", "2947.28");
    formulario.set("hspMensal", "5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5");

    assert.deepEqual(premissasDaFicha(formulario), {
      ok: true,
      demandaComplementoValor: 2_947.28,
      hspMensal: Array.from({ length: 12 }, () => 5),
    });
  });

  it("recusa HSP incompleta antes de montar a requisição", () => {
    const formulario = new FormData();
    formulario.set("hspMensal", "5, 5, 5");

    assert.deepEqual(premissasDaFicha(formulario), {
      ok: false,
      erro: ERRO_HSP_MENSAL,
    });
  });
});
