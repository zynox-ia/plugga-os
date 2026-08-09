import type {
  EnergyPremises,
  FinancialResult,
  InvoiceData,
  SavingsResult,
  SizingResult,
} from "@plugga/shared";

const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

const arredondar = (valor: number, casas = 2): number => {
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
};

function tirAnual(fluxos: readonly number[]): number | null {
  const vpl = (taxa: number): number =>
    fluxos.reduce((soma, fluxo, i) => soma + fluxo / (1 + taxa) ** i, 0);

  let baixo = -0.99;
  let alto = 10;
  if (vpl(baixo) * vpl(alto) > 0) return null;

  for (let i = 0; i < 200; i += 1) {
    const meio = (baixo + alto) / 2;
    if (vpl(baixo) * vpl(meio) <= 0) alto = meio;
    else baixo = meio;
  }
  return (baixo + alto) / 2;
}

function paybackAnual(fluxos: readonly number[], capex: number): number | null {
  let acumulado = 0;
  for (let i = 0; i < fluxos.length; i += 1) {
    const fluxo = fluxos[i] ?? 0;
    const anterior = acumulado;
    acumulado += fluxo;
    if (acumulado >= capex) {
      return i + (fluxo > 0 ? (capex - anterior) / fluxo : 0);
    }
  }
  return null;
}

export type ResultadoMotorPrd = {
  dimensionamento: SizingResult;
  economia: SavingsResult;
  financeiro: FinancialResult;
};

/**
 * Port fiel do `motor_bess_solar.py` entregue com o PRD.
 *
 * A geração solar tem uma única finalidade: repor a energia usada para carregar
 * o BESS. Excedente fica explicitamente sem crédito. O fluxo é mensal para que
 * SOH, degradação e O&M não desapareçam numa aproximação anual.
 */
export function rodarMotorPrd(
  fatura: InvoiceData,
  premissas: EnergyPremises,
): ResultadoMotorPrd {
  const ciclo =
    premissas.bessCapacidadeNominalKwh *
    premissas.bessDod *
    premissas.bessEtaRt *
    premissas.bessEtaEle *
    premissas.bessEtaOp;
  const utilMesFisicaPorBess = ciclo * premissas.diasUteisMes;
  const cargaMesFisicaPorBess =
    (premissas.bessCapacidadeNominalKwh * premissas.diasUteisMes * premissas.bessDod) /
    (premissas.bessEtaRt * premissas.bessEtaEle * premissas.bessEtaOp);

  const unidadesEnergia = Math.ceil(fatura.consumoPontaKwh / utilMesFisicaPorBess);
  const unidadesPotencia = Math.ceil(fatura.demandaMedidaPontaKw / premissas.bessPotenciaKw);
  const unidades = Math.max(unidadesEnergia, unidadesPotencia, 1);
  const limitador = unidadesPotencia >= unidadesEnergia ? "potencia" : "energia";

  const utilizacaoFisica = unidades * utilMesFisicaPorBess;
  const energiaDeslocadaMes = Math.min(utilizacaoFisica, fatura.consumoPontaKwh);
  const fatorUtilizacao = utilizacaoFisica > 0 ? energiaDeslocadaMes / utilizacaoFisica : 0;
  const cargaMes = unidades * cargaMesFisicaPorBess * fatorUtilizacao;
  const utilMesPorBess = utilMesFisicaPorBess * fatorUtilizacao;
  const cargaMesPorBess = cargaMesFisicaPorBess * fatorUtilizacao;

  const kwpPiorMes = Math.max(
    ...premissas.hspMensal.map(
      (hsp, mes) => cargaMes / (hsp * premissas.solarPr * (DIAS_MES[mes] ?? 30)),
    ),
  );
  // O orquestrador oficial usa o valor sugerido do motor, publicado com uma
  // casa decimal, para formar o CAPEX. Repetir isso mantém a paridade.
  const fvKwp = arredondar(kwpPiorMes, 1);
  const geracaoSolarMes = premissas.hspMensal.map(
    (hsp, mes) => fvKwp * hsp * premissas.solarPr * (DIAS_MES[mes] ?? 30),
  );

  const capexBess = unidades * premissas.bessCapexPorUnidade;
  const capexFv = fvKwp * premissas.fvCapexPorKwp;
  const capexTotal = capexBess + capexFv;
  const omBessAno1 = capexBess * premissas.omBessPercentualAno;
  const omSolarAno1 = capexFv * premissas.omSolarPercentualAno;

  const fluxoMensal: FinancialResult["fluxoMensal"] = [];
  const fluxoAnual: number[] = [];
  let acumulado = -capexTotal;
  let creditoSolarAno1 = 0;
  let economiaBessAno1 = 0;

  for (let ano = 0; ano < premissas.horizonteAnos; ano += 1) {
    const reajusteEnergia = (1 + premissas.reajusteTarifarioAnual) ** ano;
    const reajusteOm = (1 + premissas.reajusteOmAnual) ** ano;
    const degradacaoSolar = (1 - premissas.solarDegradacaoAnual) ** ano;
    let totalAno = 0;

    for (let mes = 0; mes < 12; mes += 1) {
      const sohInicio = premissas.sohAnual[ano] ?? premissas.sohAnual.at(-1) ?? 1;
      const sohFim = premissas.sohAnual[ano + 1] ?? sohInicio;
      const soh = sohInicio + (mes / 12) * (sohFim - sohInicio);
      const receitaPonta = energiaDeslocadaMes * soh * fatura.tarifaPonta * reajusteEnergia;
      const custoCarga = cargaMes * soh * fatura.tarifaForaPonta * reajusteEnergia;
      const geracaoSolar = (geracaoSolarMes[mes] ?? 0) * degradacaoSolar;
      const solarParaBess = Math.min(geracaoSolar, cargaMes * soh);
      const excedenteSemCredito = Math.max(0, geracaoSolar - solarParaBess);
      const creditoSolar = solarParaBess * fatura.tarifaForaPonta * reajusteEnergia;
      const omBess = (omBessAno1 * reajusteOm) / 12;
      const omSolar = (omSolarAno1 * reajusteOm) / 12;
      const economiaBess = receitaPonta - custoCarga - omBess;
      const economiaLiquida = economiaBess + creditoSolar - omSolar;

      acumulado += economiaLiquida;
      totalAno += economiaLiquida;
      if (ano === 0) {
        economiaBessAno1 += economiaBess;
        creditoSolarAno1 += creditoSolar - omSolar;
      }

      fluxoMensal.push({
        ano: ano + 1,
        mes: mes + 1,
        soh: arredondar(soh, 4),
        receitaPonta: arredondar(receitaPonta),
        custoCarga: arredondar(custoCarga),
        geracaoSolar: arredondar(geracaoSolar, 1),
        solarParaBess: arredondar(solarParaBess, 1),
        excedenteSemCredito: arredondar(excedenteSemCredito, 1),
        economiaLiquida: arredondar(economiaLiquida),
        acumulado: arredondar(acumulado),
      });
    }
    fluxoAnual.push(totalAno);
  }

  const economiaAcumulada: number[] = [];
  let somaEconomia = 0;
  for (const fluxo of fluxoAnual) {
    somaEconomia += fluxo;
    economiaAcumulada.push(somaEconomia);
  }
  const fluxoCaixaAcumulado = [-capexTotal, ...economiaAcumulada.map((v) => v - capexTotal)];
  const fluxosComCapex = [-capexTotal, ...fluxoAnual];
  const tir = tirAnual(fluxosComCapex);
  const vpl = fluxosComCapex.reduce(
    (soma, fluxo, i) => soma + fluxo / (1 + premissas.tmaAnual) ** i,
    0,
  );
  const paybackProjetadoAnos = paybackAnual(fluxoAnual, capexTotal);
  const descontados = fluxoAnual.map(
    (fluxo, i) => fluxo / (1 + premissas.tmaAnual) ** (i + 1),
  );
  const paybackDescontadoAnos = paybackAnual(descontados, capexTotal);

  const negativos = fluxoMensal.filter((mes) => mes.acumulado < 0);
  let paybackMeses: number | null = null;
  if (negativos.length < fluxoMensal.length) {
    const indice = negativos.length;
    if (indice === 0) paybackMeses = 0;
    else {
      const ultimoNegativo = negativos.at(-1)?.acumulado ?? 0;
      const proximo = fluxoMensal[indice]?.economiaLiquida ?? 0;
      paybackMeses = indice + (proximo !== 0 ? Math.abs(ultimoNegativo) / proximo : 0);
    }
  }

  const economiaAno1 = fluxoAnual[0] ?? 0;
  const economiaMensal = economiaAno1 / 12;
  const dimensionamento: SizingResult = {
    consumoPontaDiarioKwh: fatura.consumoPontaKwh / premissas.diasUteisMes,
    bessUnidadesPorEnergia: unidadesEnergia,
    bessUnidadesPorPotencia: unidadesPotencia,
    bessUnidades: unidades,
    bessLimitador: limitador,
    energiaUtilCicloKwh: ciclo,
    energiaUtilMesPorBessKwh: utilMesPorBess,
    energiaCargaMesPorBessKwh: cargaMesPorBess,
    coberturaConsumo: fatura.consumoPontaKwh > 0 ? energiaDeslocadaMes / fatura.consumoPontaKwh : 0,
    fvKwp,
    fvGeracaoMensalKwh: geracaoSolarMes.reduce((a, b) => a + b, 0) / 12,
  };

  return {
    dimensionamento,
    economia: {
      economiaBessMensal: economiaBessAno1 / 12,
      economiaFvMensal: creditoSolarAno1 / 12,
      economiaMensal,
      economiaAno1,
      faturaProjetada: Math.max(fatura.valorTotal - economiaMensal, 0),
    },
    financeiro: {
      capexBess,
      capexFv,
      capexTotal,
      fluxoAnual,
      economiaAcumulada,
      fluxoCaixaAcumulado,
      paybackSimplesAnos: economiaAno1 > 0 ? capexTotal / economiaAno1 : Number.POSITIVE_INFINITY,
      // O relatório usa o payback mensal interpolado do motor oficial.
      paybackProjetadoAnos: paybackMeses === null ? paybackProjetadoAnos : paybackMeses / 12,
      paybackDescontadoAnos,
      vpl,
      tir,
      acumulado20Anos: acumulado,
      economiaLiquida20Anos: acumulado + capexTotal,
      fluxoMensal,
    },
  };
}
