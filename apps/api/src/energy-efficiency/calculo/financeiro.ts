import type { EnergyPremises, FinancialResult, SizingResult } from "@plugga/shared";

/**
 * Pré-viabilidade financeira do cenário Solar+BESS.
 *
 * Nada aqui é orçamento fechado: os CAPEX são premissas estimadas, sem escopo
 * confirmado de projeto, instalação, EPC e adequações. O documento do cliente é
 * obrigado a dizer isso — o número serve para decidir se vale seguir, não para
 * assinar contrato.
 *
 * Fora do MVP, por decisão registrada: O&M, degradação, seguro, reposição de
 * bateria/inversor e impostos sobre o investimento.
 */

export type FinancialInput = {
  premissas: EnergyPremises;
  dimensionamento: SizingResult;
  economiaAno1: number;
};

/**
 * TIR por bisseção. Escolhida em vez de Newton por ser incondicionalmente
 * estável: fluxo de caixa convencional (um desembolso seguido de entradas)
 * troca de sinal uma única vez, então há raiz única no intervalo e a bisseção
 * sempre converge — Newton pode divergir com chute ruim.
 *
 * Devolve `null` quando não há troca de sinal no intervalo, isto é, quando o
 * investimento não se paga nem com taxa próxima de −100%.
 */
export function calcularTir(
  fluxos: readonly number[],
  capex: number,
  iteracoes = 200,
): number | null {
  const vpl = (taxa: number): number =>
    -capex + fluxos.reduce((soma, fluxo, i) => soma + fluxo / (1 + taxa) ** (i + 1), 0);

  let baixo = -0.95;
  let alto = 10;
  if (vpl(baixo) < 0 || vpl(alto) > 0) return null;

  for (let i = 0; i < iteracoes; i += 1) {
    const meio = (baixo + alto) / 2;
    if (vpl(meio) > 0) baixo = meio;
    else alto = meio;
  }
  return (baixo + alto) / 2;
}

/**
 * Ano em que a soma dos fluxos cobre o CAPEX, interpolado dentro do ano para
 * não devolver sempre número inteiro. Serve tanto para o payback projetado
 * (fluxos reajustados) quanto para o descontado (fluxos trazidos a valor
 * presente) — o que muda é a série que entra.
 *
 * A distinção importa: no piloto Serra Verde o CAPEX de R$ 5.500.000,00 contra
 * economia de R$ 709.933,58 dá **7,75 anos** de payback simples, mas o caso
 * aprovado registra **6,9 anos** — que é este cálculo com a economia crescendo
 * 4% a.a. Os estudos entregues rotulavam esse número apenas como "Payback".
 * Reportar os três com nomes distintos evita repetir a confusão.
 */
export function calcularPaybackAcumulado(
  fluxos: readonly number[],
  capex: number,
): number | null {
  let acumulado = 0;

  for (let i = 0; i < fluxos.length; i += 1) {
    const fluxo = fluxos[i] ?? 0;
    const anterior = acumulado;
    acumulado += fluxo;

    if (acumulado >= capex) {
      const fracao = fluxo > 0 ? (capex - anterior) / fluxo : 0;
      return i + fracao;
    }
  }
  return null;
}

export function calcularFinanceiro({
  premissas,
  dimensionamento,
  economiaAno1,
}: FinancialInput): FinancialResult {
  const capexBess = dimensionamento.bessUnidades * premissas.bessCapexPorUnidade;
  const capexFv = dimensionamento.fvKwp * premissas.fvCapexPorKwp;
  // Regra dura da trava: o CAPEX do cenário é sempre a soma dos dois. Mostrar
  // só o da usina foi erro registrado e motivou a validação bloqueante.
  const capexTotal = capexFv + capexBess;

  const anos = premissas.horizonteAnos;
  const fluxoAnual: number[] = [];
  for (let ano = 1; ano <= anos; ano += 1) {
    fluxoAnual.push(economiaAno1 * (1 + premissas.reajusteTarifarioAnual) ** (ano - 1));
  }

  const economiaAcumulada: number[] = [];
  let somaEconomia = 0;
  for (const fluxo of fluxoAnual) {
    somaEconomia += fluxo;
    economiaAcumulada.push(somaEconomia);
  }

  const fluxoCaixaAcumulado: number[] = [-capexTotal];
  let saldo = -capexTotal;
  for (const fluxo of fluxoAnual) {
    saldo += fluxo;
    fluxoCaixaAcumulado.push(saldo);
  }

  const fluxosDescontados = fluxoAnual.map(
    (fluxo, i) => fluxo / (1 + premissas.tmaAnual) ** (i + 1),
  );
  const vpl = -capexTotal + fluxosDescontados.reduce((soma, f) => soma + f, 0);

  return {
    capexBess,
    capexFv,
    capexTotal,
    fluxoAnual,
    economiaAcumulada,
    fluxoCaixaAcumulado,
    paybackSimplesAnos: economiaAno1 > 0 ? capexTotal / economiaAno1 : Number.POSITIVE_INFINITY,
    paybackProjetadoAnos: calcularPaybackAcumulado(fluxoAnual, capexTotal),
    paybackDescontadoAnos: calcularPaybackAcumulado(fluxosDescontados, capexTotal),
    vpl,
    tir: calcularTir(fluxoAnual, capexTotal),
  };
}
