import { PREMISSAS_2026_08, type InvoiceData } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { auditarFatura } from "./auditoria.js";
import { calcularEconomia } from "./cenarios.js";
import { analisarDemanda } from "./demanda.js";
import { dimensionar } from "./dimensionamento.js";

/**
 * A M Química — UC 0000033531002-19, ref. 06/2026.
 *
 * Caso real, trazido do workspace do agente para exercitar o motor em dado que
 * não veio de estudo de eficiência. Serve de contraprova: o piloto Serra Verde
 * e o Santa Tereza têm ponta pesada e oportunidade clara de BESS; aqui o perfil
 * é o oposto, e o motor precisa dizer isso em vez de forçar a mesma conclusão.
 *
 * **Atenção de produto:** esta unidade já está no Mercado Livre, pagando
 * R$ 86.186,20 no mês. Os valores abaixo são o **cenário cativo estimado** pela
 * auditoria Plugga (R$ 100.881,25), que é a base correta para dimensionar
 * Solar+BESS — mas qualquer economia calculada contra ele não é economia real
 * para este cliente, e sim comparação com um cenário em que ele não está.
 */
const AM_QUIMICA: InvoiceData = {
  consumoPontaKwh: 4_275,
  consumoForaPontaKwh: 126_050,
  tarifaPonta: 1.82396,
  tarifaForaPonta: 0.53899,
  valorPonta: 7_797.43,
  valorForaPonta: 67_939.69,
  valorDemanda: 15_827.0,
  valorTotal: 100_881.25,
  demandaContratadaKw: 700,
  demandaMedidaPontaKw: 249,
  demandaMedidaForaPontaKw: 586,
  tarifaDemanda: 22.61,
  valorReativo: 571.22,
  valorBeneficioFiscal: 0,
  valorMultasJurosEncargos: 0,
};

/** Maior demanda registrada por mês, 01–06/2026 (Verde: demanda é global). */
const HISTORICO_6_MESES = [634, 704, 705, 698, 668, 586];

describe("A M Química — perfil sem oportunidade de ponta", () => {
  const premissas = PREMISSAS_2026_08;
  const dimensionamento = dimensionar({ fatura: AM_QUIMICA, premissas });

  it("reconhece que a ponta é marginal nesta unidade", () => {
    const auditoria = auditarFatura(AM_QUIMICA);
    const pesoPonta = AM_QUIMICA.consumoPontaKwh / auditoria.consumoTotalKwh;

    // 4.275 kWh de ponta contra 126.050 fora ponta: 3,3% do consumo.
    expect(pesoPonta).toBeLessThan(0.04);
    expect(auditoria.reativoDiagnostico).toBe("registrar");
  });

  /**
   * A consequência de a ponta ser marginal: o BESS quase não tem o que
   * deslocar. Se o motor tratasse BESS como resposta padrão, entregaria uma
   * recomendação cara e sem lastro.
   */
  it("dimensiona pouco BESS e a economia dele é pequena perto da FV", () => {
    expect(dimensionamento.bessUnidades).toBe(3);
    expect(dimensionamento.bessLimitador).toBe("potencia");

    const economia = calcularEconomia({
      fatura: AM_QUIMICA,
      premissas,
      dimensionamento,
    });

    expect(economia.economiaBessMensal).toBeLessThan(economia.economiaFvMensal / 5);
  });

  it("não recomenda alteração de demanda: o contrato está justo", () => {
    const demanda = analisarDemanda({
      demandaContratadaKw: 700,
      historicoKw: HISTORICO_6_MESES,
      tarifaDemanda: 22.61,
      premissas,
    });

    // Pico de 705 kW contra 700 contratados — utilização de 100,7%.
    expect(demanda.picoObservadoKw).toBe(705);
    expect(demanda.utilizacao).toBeGreaterThan(1);
    // Dentro da tolerância de 735 kW, então não houve multa.
    expect(demanda.houveUltrapassagem).toBe(false);
    // Nenhum cenário atinge o gatilho de 5%: mexer no contrato não compensa.
    expect(demanda.recomendado).toBeNull();
    for (const cenario of demanda.cenarios) {
      expect(cenario.classificacao).toBe("abaixo_do_gatilho");
    }
  });

  it("marca a análise como preliminar: 6 faturas não bastam", () => {
    const demanda = analisarDemanda({
      demandaContratadaKw: 700,
      historicoKw: HISTORICO_6_MESES,
      tarifaDemanda: 22.61,
      premissas,
    });

    expect(demanda.mesesDeHistorico).toBe(6);
    expect(demanda.preliminar).toBe(true);
  });
});
