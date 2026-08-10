import { arredondar, somarComoOOraculo, tetoComoOOraculo, tirAnual } from "./aritmetica.js";
import {
  CURVA_SOH,
  DIAS_MES,
  MESES,
  paybackEmMeses,
  type MesDoFluxo,
  type SaidaDoMotor,
} from "./motor.js";

/**
 * Motor Solar+BESS — port fiel de `assets/motor_bess_solar.py`.
 *
 * O BESS carrega fora ponta e descarrega na ponta; o solar existe **só** para
 * carregar o BESS. Excedente não abate consumo fora ponta e não gera crédito —
 * decisão de 08/08/2026, e é o que separa este motor do modo legado da
 * planilha.
 *
 * Função pura: sem banco, relógio, storage ou rede.
 */

export type PremissasDoMotor = {
  /** Energia da unidade em kWh. O oráculo chama de `potencia_bess_kw`. */
  potenciaBessKw: number;
  dod: number;
  etaRt: number;
  etaEle: number;
  etaOp: number;
  diasUteisMes: number;

  consumoPontaDesejadoKwhMes: number;
  nBess: number | null;
  capexBessTotal: number;

  tusdFp: number;
  teFp: number;
  tusdP: number;
  teP: number;

  omBessPctCapexAno: number;
  /** Quando definido, entra direto — é o caminho do modelo REV04. */
  omBessAno1: number | null;
  /** Fator J12 da planilha: o BESS só fatura a energia que desloca. */
  limitarUtilizacaoAoConsumo: boolean;
  solarApenasCarregaBess: boolean;
  reajusteEnergiaAa: number;
  reajusteOmAa: number;
  tmaAa: number;

  solarKwp: number;
  solarPr: number;
  solarDegradacaoAa: number;
  capexSolarTotal: number;
  omSolarPctCapexAno: number;
  hspMensal: readonly number[];
  soh: readonly number[];
};

/** Valores da aba Premissas da planilha, iguais ao `PADRAO` do oráculo. */
export const PREMISSAS_PADRAO: PremissasDoMotor = {
  potenciaBessKw: 241.0,
  dod: 1.0,
  etaRt: 0.9556,
  etaEle: 0.98,
  etaOp: 0.99,
  diasUteisMes: 21,

  consumoPontaDesejadoKwhMes: 6900.0,
  nBess: null,
  capexBessTotal: 1_100_000.0,

  tusdFp: 0.625962,
  teFp: 0.0,
  tusdP: 2.689175,
  teP: 0.0,

  omBessPctCapexAno: 0.01,
  omBessAno1: null,
  limitarUtilizacaoAoConsumo: true,
  solarApenasCarregaBess: true,
  reajusteEnergiaAa: 0.08,
  reajusteOmAa: 0.03,
  tmaAa: 0.12,

  solarKwp: 475.0,
  solarPr: 0.85,
  solarDegradacaoAa: 0.005,
  capexSolarTotal: 1_187_500.0,
  omSolarPctCapexAno: 0.01,
  hspMensal: Array.from({ length: 12 }, () => 5.0),
  soh: CURVA_SOH,
};

export function rodarSolarBess(entrada: Partial<PremissasDoMotor>): SaidaDoMotor {
  const p: PremissasDoMotor = { ...PREMISSAS_PADRAO, ...entrada };

  const ciclo = p.potenciaBessKw * p.dod * p.etaRt * p.etaEle * p.etaOp;
  let utilMes1 = ciclo * p.diasUteisMes;
  let cargaMes1 =
    (p.potenciaBessKw * p.diasUteisMes * p.dod) / (p.etaRt * p.etaEle * p.etaOp);

  const nSugerido = tetoComoOOraculo(p.consumoPontaDesejadoKwhMes, utilMes1);
  const n = Math.trunc(p.nBess || nSugerido);

  const hfp = p.tusdFp + p.teFp;
  const hp = p.tusdP + p.teP;

  // Utilização limitada ao consumo: o BESS nunca fatura a capacidade cheia.
  const utilFisicaN = n * utilMes1;
  const utilN = p.limitarUtilizacaoAoConsumo
    ? Math.min(utilFisicaN, p.consumoPontaDesejadoKwhMes)
    : utilFisicaN;
  const u = utilFisicaN ? utilN / utilFisicaN : 0.0;
  const cargaN = n * cargaMes1 * u;
  utilMes1 = utilMes1 * u;
  cargaMes1 = cargaMes1 * u;

  const geracaoMes = DIAS_MES.map(
    (dias, m) => p.solarKwp * p.hspMensal[m]! * p.solarPr * dias,
  );

  // O&M do BESS é CAPEX total × percentual, sem multiplicar por N — fórmula
  // corrigida por Dilkson em 08/08.
  const omBessAno1 = p.omBessAno1 ?? p.capexBessTotal * p.omBessPctCapexAno;
  const omSolarAno1 = p.capexSolarTotal * p.omSolarPctCapexAno;

  const fluxo: MesDoFluxo[] = [];
  const capexTotal = p.capexBessTotal + p.capexSolarTotal;
  let acumulado = -capexTotal;
  const anuais: number[] = [-capexTotal];

  for (let ano = 0; ano < 20; ano += 1) {
    let doAno = 0.0;
    const reajusteEnergia = (1 + p.reajusteEnergiaAa) ** ano;
    const reajusteOm = (1 + p.reajusteOmAa) ** ano;
    const degradacaoSolar = (1 - p.solarDegradacaoAa) ** ano;

    for (let m = 0; m < 12; m += 1) {
      const soh = p.soh[ano]! + (m / 12.0) * (p.soh[ano + 1]! - p.soh[ano]!);
      const receitaHp = utilN * soh * hp * reajusteEnergia;
      const custoHfp = cargaN * soh * hfp * reajusteEnergia;
      const omBess = (omBessAno1 * reajusteOm) / 12;
      const geracao = geracaoMes[m]! * degradacaoSolar;
      const solarParaBess = Math.min(geracao, cargaN * soh);
      const solarExcedente = Math.max(0.0, geracao - solarParaBess);
      const omSolar = (omSolarAno1 * reajusteOm) / 12;
      const creditoSolar = p.solarApenasCarregaBess
        ? solarParaBess * hfp * reajusteEnergia
        : (solarParaBess + solarExcedente) * hfp * reajusteEnergia;
      const bruta = receitaHp - custoHfp + creditoSolar;
      const liquida = bruta - omBess - omSolar;

      acumulado += liquida;
      doAno += liquida;
      fluxo.push({
        ano: ano + 1,
        mes: MESES[m]!,
        soh: arredondar(soh, 4),
        receita_hp: arredondar(receitaHp, 2),
        custo_hfp: arredondar(custoHfp, 2),
        ger_solar: arredondar(geracao, 1),
        solar_bess: arredondar(solarParaBess, 1),
        solar_exc: arredondar(solarExcedente, 1),
        eco_liq: arredondar(liquida, 2),
        acumulado: arredondar(acumulado, 2),
      });
    }

    anuais.push(doAno);
  }

  const tma = p.tmaAa;
  const vpl = somarComoOOraculo(anuais.map((f, i) => f / (1 + tma) ** i));
  const tir = tirAnual(anuais);
  const payback = paybackEmMeses(fluxo);

  const horasSolares = DIAS_MES.map(
    (dias, m) => p.hspMensal[m]! * p.solarPr * dias,
  );

  return {
    dimensionamento: {
      energia_util_ciclo_kwh: arredondar(ciclo, 2),
      energia_util_mes_1bess: arredondar(utilMes1, 1),
      energia_carga_mes_1bess: arredondar(cargaMes1, 1),
      n_bess_sugerido: Math.trunc(nSugerido),
      n_bess_adotado: n,
      cobertura_consumo: p.consumoPontaDesejadoKwhMes
        ? arredondar(utilN / p.consumoPontaDesejadoKwhMes, 4)
        : null,
    },
    ano1_base: {
      receita_hp: arredondar(utilN * hp * 12, 2),
      custo_hfp: arredondar(cargaN * hfp * 12, 2),
      economia_bruta: arredondar(utilN * hp * 12 - cargaN * hfp * 12, 2),
      om_bess: arredondar(omBessAno1, 2),
      economia_liquida: arredondar(
        utilN * hp * 12 - cargaN * hfp * 12 - omBessAno1,
        2,
      ),
    },
    solar: {
      geracao_ano1_kwh: arredondar(somarComoOOraculo(geracaoMes), 0),
      capex: p.capexSolarTotal,
      om_ano1: arredondar(omSolarAno1, 2),
      regra: p.solarApenasCarregaBess
        ? "apenas carrega o BESS (excedente sem credito)"
        : "legado planilha (excedente creditado no FP)",
      kwp_sugerido_media: p.solarPr
        ? arredondar(cargaN / (somarComoOOraculo(horasSolares) / 12), 1)
        : null,
      kwp_sugerido_pior_mes: p.solarPr
        ? arredondar(Math.max(...horasSolares.map((horas) => cargaN / horas)), 1)
        : null,
    },
    indicadores: {
      capex_total: capexTotal,
      vpl_tma: arredondar(vpl, 2),
      tma,
      tir_aa: tir === null ? null : arredondar(tir, 4),
      payback_meses: payback ? arredondar(payback, 1) : null,
      payback_anos: payback ? arredondar(payback / 12, 2) : null,
      acumulado_20a: arredondar(acumulado, 2),
      economia_liquida_20a: arredondar(acumulado + capexTotal, 2),
    },
    fluxo_anual: anuais.map((f) => arredondar(f, 2)),
    fluxo_mensal: fluxo,
  };
}
