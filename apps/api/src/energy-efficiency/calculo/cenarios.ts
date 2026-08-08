import type { EnergyPremises, InvoiceData, SavingsResult, SizingResult } from "@plugga/shared";

/**
 * Economia dos cenários. O cenário principal é sempre **Solar+BESS**; BESS
 * isolado existe só como subdimensionamento técnico da bateria.
 */

/**
 * Economia do BESS deslocando energia da ponta.
 *
 * A conta certa não é o spread cheio. Para entregar 1 kWh na ponta é preciso
 * carregar mais de 1 kWh fora ponta, porque o ciclo tem perda — e essa energia
 * a mais também é paga. Daí:
 *
 *   economia = energia_ponta × tarifa_ponta
 *            − (energia_ponta ÷ eficiência) × tarifa_fora_ponta
 *
 * Os scripts do agente usavam `energia_ponta × (tarifa_ponta − tarifa_fora_ponta)`,
 * que ignora a perda e superestima. No caso Santa Tereza a diferença é de 2,89%
 * — R$ 12.468,12 no primeiro ano. Estudos entregues antes de 2026-08-08 ficam
 * com a fórmula antiga, marcados pela premissa da época (decisão registrada em
 * docs/decisoes-estudo-eficiencia-energetica.md §4.7); daqui em diante vale esta.
 */
export function economiaBessMensal(
  fatura: InvoiceData,
  eficienciaCiclo: number,
): number {
  const energiaEntregueNaPonta = fatura.consumoPontaKwh;
  const energiaCarregadaForaPonta = energiaEntregueNaPonta / eficienciaCiclo;

  return (
    energiaEntregueNaPonta * fatura.tarifaPonta -
    energiaCarregadaForaPonta * fatura.tarifaForaPonta
  );
}

/**
 * Fórmula anterior a 2026-08-08, preservada só para reproduzir estudos antigos
 * e para os testes de regressão contra os casos já aprovados. **Não usar em
 * estudo novo.**
 */
export function economiaBessMensalLegado(fatura: InvoiceData): number {
  return fatura.consumoPontaKwh * (fatura.tarifaPonta - fatura.tarifaForaPonta);
}

/**
 * Economia da geração FV.
 *
 * Abate só a tarifa fora ponta, e nunca mais do que o consumo fora ponta
 * existente: sem curva horária não há como afirmar que a geração cobre ponta,
 * e prometer abatimento acima do que a unidade consome seria vender energia que
 * o estudo não consegue sustentar. É aproximação conservadora, válida enquanto
 * o modo for `preliminar`.
 */
export function economiaFvMensal(fatura: InvoiceData, geracaoMensalKwh: number): number {
  const energiaAproveitada = Math.min(geracaoMensalKwh, fatura.consumoForaPontaKwh);
  return energiaAproveitada * fatura.tarifaForaPonta;
}

export type SavingsInput = {
  fatura: InvoiceData;
  premissas: EnergyPremises;
  dimensionamento: SizingResult;
  /** Reproduz a fórmula anterior; só para estudo antigo. */
  usarFormulaLegada?: boolean;
};

export function calcularEconomia({
  fatura,
  premissas,
  dimensionamento,
  usarFormulaLegada = false,
}: SavingsInput): SavingsResult {
  const economiaBessMes = usarFormulaLegada
    ? economiaBessMensalLegado(fatura)
    : economiaBessMensal(fatura, premissas.bessEficienciaCiclo);

  const economiaFvMes = economiaFvMensal(fatura, dimensionamento.fvGeracaoMensalKwh);
  const economiaMensal = economiaBessMes + economiaFvMes;

  return {
    economiaBessMensal: economiaBessMes,
    economiaFvMensal: economiaFvMes,
    economiaMensal,
    economiaAno1: economiaMensal * 12,
    // A fatura não fica negativa: se a economia calculada superar o total, o
    // que sobra é sinal de premissa otimista, não de a distribuidora pagar o
    // cliente. Trava o número antes de ele chegar ao documento.
    faturaProjetada: Math.max(fatura.valorTotal - economiaMensal, 0),
  };
}
