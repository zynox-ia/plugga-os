/**
 * Forma da saída dos motores.
 *
 * As chaves são as do oráculo, em `snake_case`, de propósito: esta saída é
 * comparada campo a campo contra o JSON que o Python produz, e uma camada de
 * renomeação no meio esconderia divergência em vez de revelá-la. A tradução
 * para os nomes do sistema acontece depois, na borda.
 */

export type MesDoFluxo = {
  ano: number;
  mes: string;
  soh: number;
  receita_hp: number;
  custo_hfp: number;
  ger_solar: number;
  solar_bess: number;
  solar_exc: number;
  eco_liq: number;
  acumulado: number;
};

export type Dimensionamento = {
  energia_util_ciclo_kwh: number;
  energia_util_mes_1bess: number;
  energia_carga_mes_1bess: number;
  n_bess_sugerido: number;
  n_bess_adotado: number;
  cobertura_consumo: number | null;
  /** Só no peak shaving. */
  funcao?: string;
  criterio?: string;
  potencia_disponivel_kw?: number;
  pico_ponta_kw?: number;
};

export type Ano1Base = {
  receita_hp: number;
  custo_hfp: number;
  economia_bruta: number;
  om_bess: number;
  economia_liquida: number;
  economia_demanda_mes?: number;
};

export type BlocoSolar = {
  geracao_ano1_kwh: number;
  capex: number;
  om_ano1: number;
  regra: string;
  kwp_sugerido_media: number | null;
  kwp_sugerido_pior_mes: number | null;
};

export type Indicadores = {
  capex_total: number;
  vpl_tma: number;
  tma: number;
  tir_aa: number | null;
  payback_meses: number | null;
  payback_anos: number | null;
  acumulado_20a: number;
  economia_liquida_20a: number;
};

export type SaidaDoMotor = {
  dimensionamento: Dimensionamento;
  ano1_base: Ano1Base;
  solar: BlocoSolar;
  indicadores: Indicadores;
  fluxo_anual: number[];
  fluxo_mensal: MesDoFluxo[];
};

export const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export const MESES = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

/**
 * Curva SOH da Huawei, um ciclo por dia e profundidade total, dos anos 0 a 20.
 * O fluxo interpola mês a mês entre dois anos consecutivos.
 */
export const CURVA_SOH = [
  1.0, 0.971, 0.948, 0.927, 0.907, 0.888, 0.87, 0.852, 0.834, 0.817, 0.799,
  0.783, 0.763, 0.75, 0.734, 0.718, 0.703, 0.688, 0.673, 0.659, 0.645,
] as const;

/**
 * Payback em meses, do jeito do oráculo: conta os meses de acumulado negativo e
 * interpola dentro do primeiro mês positivo.
 *
 * Detalhe herdado e preservado: quando o payback dá exatamente zero, o oráculo
 * grava `null`, porque o `if payback_meses` do Python trata `0.0` como falso.
 * Reproduzir isso é o ponto de um port fiel.
 */
export function paybackEmMeses(fluxo: readonly MesDoFluxo[]): number | null {
  const negativos = fluxo.filter((mes) => mes.acumulado < 0);
  if (negativos.length >= fluxo.length) return null;

  const k = negativos.length;
  if (k === 0) return 0;

  const ultimoNegativo = negativos[k - 1]!.acumulado;
  const proximo = fluxo[k]!.eco_liq;
  return k + (proximo ? Math.abs(ultimoNegativo) / proximo : 0);
}
