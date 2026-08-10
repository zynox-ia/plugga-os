import { arredondar, somarComoOOraculo, tirAnual } from "./aritmetica.js";
import {
  CURVA_SOH,
  DIAS_MES,
  MESES,
  paybackEmMeses,
  type MesDoFluxo,
  type SaidaDoMotor,
} from "./motor.js";

/**
 * Motor de PEAK SHAVING — port fiel de `assets/motor_peak_shaving.py`.
 *
 * Nome definido por Dilkson em 08/08/2026: é peak shaving, não load shifting.
 * O BESS cobre toda a carga da janela de ponta, a demanda de ponta medida cai
 * para perto de zero e o contrato de ponta é reduzido ao mínimo. A economia é a
 * conta de demanda eliminada — medida e não consumida — menos o contrato
 * remanescente. A energia continua a mesma: o BESS carrega fora ponta, com
 * perdas, e o solar carrega o BESS.
 *
 * O dimensionamento tem garantia de 20 anos: N é escolhido para que a energia
 * útil ainda cubra a ponta diária quando o SOH chegar a 64,5%, sem
 * recontratação.
 *
 * **Limitação reproduzida de propósito:** o motor calcula o SOH mês a mês e o
 * registra no fluxo, mas não o aplica à receita nem à carga. Isso torna os
 * indicadores otimistas em relação à física da bateria. A decisão foi replicar
 * o oráculo exatamente nesta versão — não se muda linguagem e regra de negócio
 * ao mesmo tempo. Corrigir exige nova versão do motor, novos goldens e decisão
 * explícita, e o teste ao lado existe para impedir que a correção aconteça em
 * silêncio.
 */

export type PremissasDoPeakShaving = {
  potenciaBessKw: number;
  dod: number;
  etaRt: number;
  etaEle: number;
  etaOp: number;
  diasUteisMes: number;

  demandaPontaMedidaKw: number;
  tarifaKwPontaMedida: number;
  demandaPontaNcKw: number;
  tarifaKwPontaNc: number;
  contratoPontaNovoKw: number;

  consumoPontaDesejadoKwhMes: number;
  tusdFp: number;
  teFp: number;
  /** Quando ausente, a ponta usa a mesma tarifa do fora ponta (azul). */
  tusdP: number | null;
  teP: number | null;

  nBess: number | null;
  capexBessTotal: number | null;
  capexUnitario: number;
  omBessPctCapexAno: number;
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

export const PREMISSAS_PADRAO_PEAK: PremissasDoPeakShaving = {
  potenciaBessKw: 241.0,
  dod: 1.0,
  etaRt: 0.9556,
  etaEle: 0.98,
  etaOp: 0.99,
  diasUteisMes: 21,

  demandaPontaMedidaKw: 0.0,
  tarifaKwPontaMedida: 0.0,
  demandaPontaNcKw: 0.0,
  tarifaKwPontaNc: 0.0,
  contratoPontaNovoKw: 0.0,

  consumoPontaDesejadoKwhMes: 0.0,
  tusdFp: 0.0,
  teFp: 0.0,
  tusdP: null,
  teP: null,

  nBess: null,
  capexBessTotal: null,
  capexUnitario: 550_000.0,
  omBessPctCapexAno: 0.01,
  reajusteEnergiaAa: 0.08,
  reajusteOmAa: 0.03,
  tmaAa: 0.12,

  solarKwp: 0.0,
  solarPr: 0.85,
  solarDegradacaoAa: 0.005,
  capexSolarTotal: 0.0,
  omSolarPctCapexAno: 0.01,
  hspMensal: Array.from({ length: 12 }, () => 4.5),
  soh: CURVA_SOH,
};

export function rodarPeakShaving(
  entrada: Partial<PremissasDoPeakShaving>,
): SaidaDoMotor {
  const p: PremissasDoPeakShaving = { ...PREMISSAS_PADRAO_PEAK, ...entrada };

  const ciclo = p.potenciaBessKw * p.dod * p.etaRt * p.etaEle * p.etaOp;
  const consumoDia = p.consumoPontaDesejadoKwhMes / p.diasUteisMes;
  const soh20 = p.soh[20]!;

  // N garante o ano 20: energia útil com o SOH final cobre a ponta diária.
  const nSugerido = Math.max(
    Math.ceil(consumoDia / (ciclo * soh20)),
    Math.ceil(p.demandaPontaMedidaKw / p.potenciaBessKw),
  );
  const n = Math.trunc(p.nBess || nSugerido);
  const capexBess = p.capexBessTotal || n * p.capexUnitario;

  const hfp = p.tusdFp + p.teFp;
  const hp = p.tusdP !== null && p.teP !== null ? p.tusdP + p.teP : hfp;
  const fator = 1.0 / (p.etaRt * p.etaEle * p.etaOp);

  const utilMes = p.consumoPontaDesejadoKwhMes; // cobre 100% da ponta
  const cargaMes = utilMes * fator;
  const economiaDemandaMes =
    p.demandaPontaMedidaKw * p.tarifaKwPontaMedida +
    p.demandaPontaNcKw * p.tarifaKwPontaNc -
    p.contratoPontaNovoKw * p.tarifaKwPontaNc;

  const geracaoMes = DIAS_MES.map(
    (dias, m) => p.solarKwp * p.hspMensal[m]! * p.solarPr * dias,
  );
  const omBessAno1 = capexBess * p.omBessPctCapexAno;
  const omSolarAno1 = p.capexSolarTotal * p.omSolarPctCapexAno;

  const fluxo: MesDoFluxo[] = [];
  const capexTotal = capexBess + p.capexSolarTotal;
  let acumulado = -capexTotal;
  const anuais: number[] = [-capexTotal];

  for (let ano = 0; ano < 20; ano += 1) {
    let doAno = 0.0;
    const reajusteEnergia = (1 + p.reajusteEnergiaAa) ** ano;
    const reajusteOm = (1 + p.reajusteOmAa) ** ano;
    const degradacaoSolar = (1 - p.solarDegradacaoAa) ** ano;

    for (let m = 0; m < 12; m += 1) {
      // O SOH é calculado e registrado, mas não entra na conta. Ver o aviso no
      // topo do arquivo: é a limitação do oráculo, replicada de propósito.
      const soh = p.soh[ano]! + (m / 12.0) * (p.soh[ano + 1]! - p.soh[ano]!);

      const receitaDemanda = economiaDemandaMes * reajusteEnergia;
      const receitaHp = utilMes * hp * reajusteEnergia;
      const custoHfp = cargaMes * hfp * reajusteEnergia;
      const geracao = geracaoMes[m]! * degradacaoSolar;
      const solarParaBess = Math.min(geracao, cargaMes);
      const creditoSolar = solarParaBess * hfp * reajusteEnergia;
      const omBess = (omBessAno1 * reajusteOm) / 12;
      const omSolar = (omSolarAno1 * reajusteOm) / 12;
      const liquida =
        receitaDemanda + receitaHp - custoHfp + creditoSolar - omBess - omSolar;

      acumulado += liquida;
      doAno += liquida;
      fluxo.push({
        ano: ano + 1,
        mes: MESES[m]!,
        soh: arredondar(soh, 4),
        receita_hp: arredondar(receitaDemanda + receitaHp, 2),
        custo_hfp: arredondar(custoHfp, 2),
        ger_solar: arredondar(geracao, 1),
        solar_bess: arredondar(solarParaBess, 1),
        solar_exc: arredondar(Math.max(0.0, geracao - solarParaBess), 1),
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
  const hspMinimo = Math.min(...p.hspMensal);

  return {
    dimensionamento: {
      funcao: "PEAK SHAVING (reducao de demanda de ponta)",
      energia_util_ciclo_kwh: arredondar(ciclo, 2),
      energia_util_mes_1bess: arredondar(ciclo * p.diasUteisMes, 1),
      energia_carga_mes_1bess: arredondar(ciclo * p.diasUteisMes * fator, 1),
      n_bess_sugerido: Math.trunc(nSugerido),
      n_bess_adotado: n,
      criterio: `cobertura de 100% da ponta ATE O ANO 20 (SOH ${(soh20 * 100).toFixed(1)}%)`,
      cobertura_consumo: 1.0,
      potencia_disponivel_kw: n * p.potenciaBessKw,
      pico_ponta_kw: p.demandaPontaMedidaKw,
    },
    ano1_base: {
      receita_hp: arredondar((economiaDemandaMes + utilMes * hp) * 12, 2),
      custo_hfp: arredondar(cargaMes * hfp * 12, 2),
      economia_bruta: arredondar(
        (economiaDemandaMes + utilMes * hp - cargaMes * hfp) * 12,
        2,
      ),
      om_bess: arredondar(omBessAno1, 2),
      economia_liquida: arredondar(
        (economiaDemandaMes + utilMes * hp - cargaMes * hfp) * 12 - omBessAno1,
        2,
      ),
      economia_demanda_mes: arredondar(economiaDemandaMes, 2),
    },
    solar: {
      geracao_ano1_kwh: arredondar(somarComoOOraculo(geracaoMes), 0),
      capex: p.capexSolarTotal,
      om_ano1: arredondar(omSolarAno1, 2),
      regra: "apenas carrega o BESS (excedente sem credito)",
      kwp_sugerido_media: arredondar(
        cargaMes /
          21 /
          ((somarComoOOraculo([...p.hspMensal]) / 12) * p.solarPr * 0.854),
        1,
      ),
      kwp_sugerido_pior_mes: arredondar(
        cargaMes / 21 / (hspMinimo * p.solarPr * 0.854),
        1,
      ),
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
