import type { EnergyPremises, InvoiceData, SizingResult } from "@plugga/shared";

/**
 * Pré-dimensionamento do BESS e da usina FV.
 *
 * O resultado é **sugestão**, não conclusão: quantas unidades cabem de fato
 * depende de área, ventilação, conexão, proteção e transformador. Por isso o
 * estudo carrega `siteFeasibilityStatus` à parte — o número daqui é o ponto de
 * partida da conversa técnica, não o fim dela.
 */

/** Dias usados para converter consumo mensal de ponta em consumo diário. */
export const DIAS_CORRIDOS = 30;

export type SizingInput = {
  fatura: InvoiceData;
  premissas: EnergyPremises;
  /**
   * Base de dias. `dias_corridos` (30) é a simplificação de pré-viabilidade;
   * com memória de massa, passa-se o número real de dias com ponta tarifária,
   * que é menor e portanto exige mais bateria por dia.
   */
  baseDias?: number;
};

export function dimensionar({ fatura, premissas, baseDias }: SizingInput): SizingResult {
  const dias = baseDias ?? DIAS_CORRIDOS;
  const consumoPontaDiarioKwh = dias > 0 ? fatura.consumoPontaKwh / dias : 0;

  // Dois limitadores independentes, e o maior manda: de nada adianta ter kWh
  // suficiente para a ponta se o banco não entrega o kW no instante do pico —
  // e vice-versa. Foi um dos aprendizados registrados do piloto.
  const bessUnidadesPorEnergia = Math.ceil(
    consumoPontaDiarioKwh / premissas.bessCapacidadeUtilKwh,
  );
  const bessUnidadesPorPotencia = Math.ceil(
    fatura.demandaMedidaPontaKw / premissas.bessPotenciaKw,
  );
  const bessUnidades = Math.max(bessUnidadesPorEnergia, bessUnidadesPorPotencia);

  // A usina é dimensionada por um percentual do consumo total, não do consumo
  // fora ponta: a premissa é atender parte da carga da unidade, e a alocação
  // fina entre postos só é possível com curva horária.
  const consumoTotalKwh = fatura.consumoPontaKwh + fatura.consumoForaPontaKwh;
  const fvKwp = Math.ceil(
    (consumoTotalKwh * premissas.fvPercentualAtendimento) /
      premissas.fvProdutividadeKwhPorKwpMes,
  );

  return {
    consumoPontaDiarioKwh,
    bessUnidadesPorEnergia,
    bessUnidadesPorPotencia,
    bessUnidades,
    bessLimitador:
      bessUnidadesPorPotencia >= bessUnidadesPorEnergia ? "potencia" : "energia",
    fvKwp,
    fvGeracaoMensalKwh: fvKwp * premissas.fvProdutividadeKwhPorKwpMes,
  };
}
