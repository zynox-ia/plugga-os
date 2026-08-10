import type { FaturaNormativa, ItemDaFatura } from "@plugga/shared";

import { arredondar, somarComoOOraculo } from "./aritmetica.js";
import { comSeisCasas, comTresCasas, comUmaCasa, compacto, fint, fmt } from "./formato.js";
import {
  alturaDaBarra,
  reescreverBarras,
  reescreverSerieAcumulada,
  reescreverSerieAnual,
  yDaBarra,
  type Barra,
} from "./graficos.js";
import type { SaidaDoMotor } from "./motor.js";
import { lerModeloOficial, type CasoDoRelatorio } from "./relatorio-literal.js";

/**
 * Construtor automático do caso de substituições — port fiel de
 * `assets/montar_caso_relatorio.py`.
 *
 * Ele elimina o último passo criativo: as 121 chaves que na Santa Tereza foram
 * montadas à mão passam a ser **derivadas por regra** a partir das duas fontes
 * de verdade — a fatura conciliada e os dois fluxos do motor. Nenhum texto e
 * nenhum número do relatório é escrito por quem opera.
 *
 * Fora do envelope suportado ele recusa e manda escalar, em vez de produzir um
 * relatório que ninguém conferiu.
 */

/** Economia anual do caso-fonte, usada para achar as linhas da tabela. */
const ECONOMIA_DO_MODELO = [
  709933.58, 738330.92, 767864.16, 798578.73, 830521.88, 863742.75, 898292.46,
  934224.16, 971593.13, 1010456.85, 1050875.12, 1092910.13, 1136626.53,
  1182091.6, 1229375.26, 1278550.27, 1329692.28, 1382879.97, 1438195.17,
  1495722.98,
] as const;

const ACUMULADO_DO_MODELO = [
  -5500000.0, -4790066.42, -4051735.5, -3283871.34, -2485292.61, -1654770.73,
  -791027.98, 107264.48, 1041488.64, 2013081.76, 3023538.61, 4074413.74,
  5167323.87, 6303950.4, 7486042.0, 8715417.26, 9993967.53, 11323659.81,
  12706539.78, 14144734.95, 15640457.93,
] as const;

const CAPEX_POR_BESS = 550_000.0;

export class ForaDoEnvelopeError extends Error {
  constructor(motivo: string) {
    super(`fora do envelope suportado — escalar (amarelo): ${motivo}`);
    this.name = "ForaDoEnvelopeError";
  }
}

export class CasoIncoerenteError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "CasoIncoerenteError";
  }
}

export type EntradaDoCaso = {
  fatura: FaturaNormativa;
  /** Tarifas do caso do motor, para fechar contra a fatura. */
  tarifas: { tusdP: number | null; teP: number | null; tusdFp: number; teFp: number };
  consumoPontaDoCaso: number;
  fluxoBess: SaidaDoMotor;
  fluxoSolar: SaidaDoMotor;
  solarKwp: number;
  capexSolarTotal: number;
};

export function montarCasoDoRelatorio(
  entrada: EntradaDoCaso,
  modelo = lerModeloOficial(),
): CasoDoRelatorio {
  const { fatura: fat, fluxoBess: flx, fluxoSolar: fs } = entrada;

  // ---------- envelope ----------
  const peak = fat.funcao === "peak_shaving";
  if (
    (fat.regime !== "cativo" && fat.regime !== "mercado_livre") ||
    (fat.modalidade !== "verde" && !peak) ||
    fat.grupo.toUpperCase() !== "A"
  ) {
    throw new ForaDoEnvelopeError(
      `cobre cativo/ML de grupo A verde; este caso é ${fat.regime}/${fat.grupo}/${fat.modalidade}`,
    );
  }
  for (const campo of ["apelido", "leituraAnterior", "leituraAtual", "classeDisplay"] as const) {
    if (!fat[campo]) {
      throw new CasoIncoerenteError(`fatura sem campo '${campo}' (necessário ao relatório)`);
    }
  }

  // O oráculo indexa os itens por nome em minúsculas: nome repetido colapsa.
  const porNome = new Map<string, ItemDaFatura>();
  for (const item of fat.itens) porNome.set(item.nome.toLowerCase(), item);
  const acharItem = (...nomes: string[]): ItemDaFatura | undefined => {
    for (const alvo of nomes) {
      for (const [nome, item] of porNome) if (nome.includes(alvo)) return item;
    }
    return undefined;
  };

  const ip = acharItem("consumo ponta");
  if (!ip) throw new ForaDoEnvelopeError("sem item consumo ponta");
  const ifp = acharItem("fora ponta");
  if (!ifp) throw new ForaDoEnvelopeError("sem item consumo fora ponta");
  const idm = acharItem("demanda");
  if (!idm) throw new ForaDoEnvelopeError("sem item demanda");

  const TOTAL = fat.total;
  const reconhecidos = new Set<ItemDaFatura>([ip, ifp, idm]);
  for (const item of fat.itens) {
    const nome = item.nome.toLowerCase();
    if (
      nome.includes("cosip") ||
      nome.includes("ilum") ||
      nome.includes("apcei") ||
      nome.includes("reativo") ||
      nome.includes("ultrapassagem")
    ) {
      continue;
    }
    if (!reconhecidos.has(item) && item.valor / TOTAL >= 0.01) {
      throw new ForaDoEnvelopeError(
        `item '${item.nome}' pesa ${((item.valor / TOTAL) * 100).toFixed(1)}% do total e o modelo não tem linha para ele`,
      );
    }
  }

  const CP = fat.consumoPontaKwh;
  const CFP = fat.consumoFpKwh;
  const CONS = CP + CFP;
  const V_P = ip.valor;
  const V_FP = ifp.valor;
  const V_DEM = idm.valor;
  const TAR_P = ip.tarifa;
  if (!TAR_P) throw new ForaDoEnvelopeError("consumo ponta sem tarifa");
  const TAR_FP = ifp.tarifa;
  if (!TAR_FP) throw new ForaDoEnvelopeError("fora ponta sem tarifa");

  const DCON = fat.demandaContratadaKw;
  const DRP = fat.demandaRegistradaPontaKw ?? 0;
  const DRF = fat.demandaRegistradaFpKw ?? 0;
  const DREG = Math.max(DRP, DRF);
  const DFAT = idm.kw ?? DREG;
  const ultraValor = fat.ultrapassagemValor ?? 0.0;
  const ultraKw = fat.ultrapassagemKw ?? 0;
  if (DREG > DCON * 1.05 && !ultraValor) {
    throw new ForaDoEnvelopeError(
      "demanda registrada acima de contratada+5% sem item de ultrapassagem declarado",
    );
  }

  // Coerência entre o caso do motor e a fatura: fecha o último furo.
  const hfpCaso = entrada.tarifas.tusdFp + entrada.tarifas.teFp;
  const hpCaso =
    entrada.tarifas.tusdP === null && peak
      ? hfpCaso
      : (entrada.tarifas.tusdP ?? 0) + (entrada.tarifas.teP ?? 0);
  if (
    Math.abs(hpCaso - (fat.tarifaPontaTotal ?? 0)) > 1e-6 ||
    Math.abs(hfpCaso - (fat.tarifaFpTotal ?? 0)) > 1e-6
  ) {
    throw new CasoIncoerenteError(
      `caso do motor com tarifas != fatura (hp ${hpCaso} vs ${fat.tarifaPontaTotal}; hfp ${hfpCaso} vs ${fat.tarifaFpTotal})`,
    );
  }
  if (Math.abs(entrada.consumoPontaDoCaso - CP) > 0.5) {
    throw new CasoIncoerenteError(
      `caso do motor: consumo de ponta != o da fatura (${entrada.consumoPontaDoCaso} vs ${CP})`,
    );
  }

  // ---------- derivações da fatura ----------
  const reatPontaValor = fat.reativoPontaValor ?? 0.0;
  const reatFpValor = fat.reativoFpValor ?? 0.0;
  const reatValor = reatPontaValor + reatFpValor;
  const beneficio = fat.beneficioIsencaoValor ?? 0.0;
  const ml = fat.regime === "mercado_livre";
  const nf = fat.energiaNf;
  if (ml) {
    if (!nf || !fat.distribuidoraDisplay || !fat.localidade || !fat.totalGastoEnergia) {
      throw new CasoIncoerenteError(
        "fatura de mercado livre sem NF, distribuidora, localidade ou gasto total",
      );
    }
  }

  const utilFp = (DRF / DCON) * 100;
  const utilPonta = (DRP / DCON) * 100;
  const util = (DREG / DCON) * 100;
  const folga = DCON - DREG;
  let ideal = Math.ceil(DREG / 1.05);
  let reducaoKw: number;
  let economiaDemanda: number;

  if (ultraValor) {
    // Contrato estourado: a recomendação é aumentar até o ideal, e a economia
    // líquida é a ultrapassagem paga em dobro menos o custo do aumento.
    reducaoKw = ideal - DCON;
    economiaDemanda = ultraValor - reducaoKw * (fat.tarifaDemandaKw ?? 0.0);
  } else {
    if (ideal >= DCON) {
      ideal = DCON;
      reducaoKw = 0;
    } else {
      reducaoKw = DCON - ideal;
    }
    if (reducaoKw === 0) economiaDemanda = 0.0;
    else if (fat.demandaComplementoValor !== undefined && fat.demandaComplementoValor !== null) {
      economiaDemanda = fat.demandaComplementoValor;
    } else economiaDemanda = reducaoKw * (V_DEM / DFAT);
  }

  const spread = (fat.tarifaPontaTotal ?? 0) / (fat.tarifaFpTotal ?? 1);
  if (spread > 10 && !peak) {
    throw new ForaDoEnvelopeError(`spread ${spread.toFixed(1)}x acima da faixa sanitária`);
  }

  // ---------- derivações do motor ----------
  // O apresentado é o cenário Solar+BESS; o BESS sozinho fica na tabela de
  // comparação de cenários.
  const anuaisBess = flx.fluxo_anual;
  const indicadoresBess = flx.indicadores;
  const capexBess = Math.abs(anuaisBess[0]!);
  const economiaAno1Bess = anuaisBess[1]!;
  const acumulado20Bess = arredondar(somarComoOOraculo(anuaisBess), 2);
  const unidadesBess = Math.round(capexBess / CAPEX_POR_BESS);

  const anuais = fs.fluxo_anual;
  const economias = anuais.slice(1);
  const acumulados: number[] = [anuais[0]!];
  for (const valor of economias) {
    acumulados.push(arredondar(acumulados[acumulados.length - 1]! + valor, 2));
  }
  const indicadores = fs.indicadores;
  const economiaAno1 = economias[0]!;
  const mensal = economiaAno1 / 12;
  const faturaComBess = TOTAL - mensal;
  const reducaoPercentual = (mensal / TOTAL) * 100;

  if (indicadores.payback_meses === null || indicadoresBess.payback_meses === null) {
    throw new ForaDoEnvelopeError(
      "payback inexistente em 20 anos — estudo inviável não gera relatório de oportunidade",
    );
  }
  const paybackAnos = indicadores.payback_meses / 12;
  const paybackAnosBess = indicadoresBess.payback_meses / 12;
  const acumulado20 = acumulados[20]!;
  const ciclo = flx.dimensionamento.energia_util_ciclo_kwh;
  const energiaDia = CP / 21.0;
  const unidadesPorEnergia = peak
    ? Math.ceil(energiaDia / (ciclo * 0.645))
    : Math.ceil(energiaDia / ciclo);
  const unidadesPorPotencia = DRP ? Math.ceil(DRP / 241.0) : 1;
  if (unidadesPorEnergia < unidadesPorPotencia) {
    throw new ForaDoEnvelopeError(
      "BESS limitado por potência — redigir com Dilkson (o envelope cobre limitado por energia)",
    );
  }
  const acumulado20Solar = arredondar(somarComoOOraculo(anuais), 2);

  // ---------- substituições ----------
  const S: Record<string, string> = {};
  const sub = (de: string, para: string): void => {
    if (!modelo.includes(de)) {
      throw new CasoIncoerenteError(`chave do modelo sumiu (modelo trocado?): ${de.slice(0, 60)}`);
    }
    S[de] = para;
  };
  const rx = (padrao: RegExp, para: string): void => {
    const achado = padrao.exec(modelo);
    if (!achado) {
      throw new CasoIncoerenteError(`regex sem match no modelo: ${padrao.source.slice(0, 60)}`);
    }
    sub(achado[0], para);
  };

  const clienteMaiusculo = fat.cliente.toUpperCase();
  const nomeDaAnalise = fat.nomeAnalise ?? fat.cliente;
  sub("Energética — Serra Verde", `Energética — ${fat.apelido}`);
  sub("AGROINDUSTRIAL SERRA VERDE LTDA", clienteMaiusculo);
  sub("Agroindustrial Serra Verde", nomeDaAnalise);
  sub("0188872-2", String(fat.uc));
  sub("Agroindustrial / rural", fat.classeDisplay!);
  if (fat.distribuidoraDisplay && fat.distribuidoraDisplay !== "Roraima Energia S.A.") {
    sub("Roraima Energia S.A.", fat.distribuidoraDisplay);
  }
  if (fat.localidade && fat.localidade !== "Boa Vista/RR") {
    sub("Boa Vista/RR", fat.localidade);
  }

  if (peak) {
    rx(
      /A energia fora ponta concentra a maior parte do valor, mas a ponta representa custo desproporcional: somente/,
      `Na modalidade AZUL o peso está na DEMANDA: os contratos de demanda respondem por ${fmt(
        (V_DEM / TOTAL) * 100,
      )}% do valor do fio, e a demanda de PONTA custa R$ ${fmt(
        fat.tarifaKwPontaMedida ?? 0,
      )}/kW — o alvo do PEAK SHAVING. O consumo de ponta é somente`,
    );
    sub(
      "Isso explica por que a oportunidade está menos na demanda contratada e mais no deslocamento/gestão do custo de ponta.",
      "Isso explica por que a oportunidade aqui é a ELIMINAÇÃO da demanda de ponta com BESS (PEAK SHAVING), e não o deslocamento de consumo (load shifting).",
    );
    rx(
      /O ponto de maior atenção está no custo de ponta\. Embora a ponta represente apenas/,
      `O ponto de maior atenção está na DEMANDA de ponta: R$ ${fmt(
        fat.demandaPontaValorTotal ?? 0,
      )} por mês (${fint(DRP)} kW a R$ ${fmt(
        fat.tarifaKwPontaMedida ?? 0,
      )}/kW). A função recomendada é PEAK SHAVING — o consumo de ponta representa apenas`,
    );
    sub(
      "fatura bem controlada em demanda, mas com custo de ponta muito superior ao fora ponta",
      `fatura de modalidade azul com demanda de ponta muito cara (R$ ${fmt(
        fat.tarifaKwPontaMedida ?? 0,
      )}/kW)`,
    );
  }
  if (ml) {
    sub("fatura cativa", "fatura Mercado Livre (TUSD + ACL)");
    sub("Custo médio total", "Custo médio do fio (TUSD)");
  }

  sub("06/2025", fat.referencia);
  sub("21/07/2025", fat.vencimento);
  sub("31/05/2025", fat.leituraAnterior!);
  sub("30/06/2025", fat.leituraAtual!);
  sub("R$ 291.154,80", `R$ ${fmt(TOTAL)}`);
  sub("548.413 kWh", `${fint(CONS)} kWh`);

  const custoEfetivo = (V_P + V_FP + V_DEM) / CONS;
  // A ordem importa: 0,52 é consumida antes de 0,53 criar um novo "R$ 0,52/kWh".
  sub("R$ 1,77/kWh", `R$ ${fmt(TAR_P)}/kWh`);
  sub("R$ 0,39/kWh", `R$ ${fmt(TAR_FP)}/kWh`);
  if (fmt(custoEfetivo) === "0,53" && fmt(TOTAL / CONS) !== "0,53") {
    throw new CasoIncoerenteError("colisão de cadeia 0,52/0,53 nos custos médios — revisar");
  }
  sub("R$ 0,52/kWh", `R$ ${fmt(custoEfetivo)}/kWh`);
  sub("R$ 0,53/kWh", `R$ ${fmt(TOTAL / CONS)}/kWh`);

  // Destaques por regra.
  let fraseDemanda: string;
  if (ultraValor) {
    fraseDemanda = `demanda contratada ESTOURADA (${fint(DREG)} kW registrados para ${fint(
      DCON,
    )} contratados — ultrapassagem de R$ ${fmt(ultraValor)} no ciclo)`;
  } else if (util < 90) {
    fraseDemanda = `demanda contratada com folga (utilização de ${fmt(util)}%)`;
  } else {
    fraseDemanda = `demanda contratada bem utilizada (${fmt(util)}%)`;
  }

  let fraseReativo: string;
  if (reatValor === 0) fraseReativo = "sem cobrança de energia reativa nesta referência";
  else if (reatValor < TOTAL * 0.001) {
    fraseReativo = `cobrança de energia reativa desprezível no ciclo (R$ ${fmt(reatValor)})`;
  } else {
    fraseReativo = `cobrança de energia reativa de ${fmt(
      (reatValor / TOTAL) * 100,
    )}% da fatura`;
  }

  const bandeiraNaoCobrada = (fat.naoCobrados ?? []).find((linha) =>
    linha.nome.toLowerCase().includes("bandeira"),
  );
  const itemBandeira = acharItem("bandeira");
  let fraseBandeira: string;
  if (itemBandeira) fraseBandeira = `bandeira com impacto de R$ ${fmt(itemBandeira.valor)} no ciclo`;
  else if (bandeiraNaoCobrada) fraseBandeira = "bandeira verde no ciclo (sem custo adicional)";
  else fraseBandeira = "sem adicional de bandeira no ciclo";
  const fraseUltrapassagem = ultraValor ? "" : ", sem ultrapassagem identificada";

  const diagnostico = /demanda contratada bem utilizada[\s\S]*?BESS\/Solar\+BESS\./;
  if (peak) {
    rx(
      diagnostico,
      `modalidade AZUL: o custo da ponta está na DEMANDA — R$ ${fmt(
        fat.demandaPontaValorTotal ?? 0,
      )}/mês (${fint(DRP)} kW medidos a R$ ${fmt(
        fat.tarifaKwPontaMedida ?? 0,
      )}/kW)${fraseUltrapassagem}; ${fraseReativo}; ${fraseBandeira}; função recomendada: PEAK SHAVING com BESS/Solar+BESS (não é load shifting).`,
    );
  } else {
    rx(
      diagnostico,
      `${fraseDemanda}${fraseUltrapassagem}; ${fraseReativo}; ${fraseBandeira}; a ponta custa ${spread
        .toFixed(1)
        .replace(".", ",")}x a fora ponta e abre oportunidade para BESS/Solar+BESS.`,
    );
  }

  // Seção 3 — demanda.
  sub("<td>Demanda</td><td>1.149 kW</td>", `<td>Demanda</td><td>${fint(DFAT)} kW</td>`);
  sub("1.198 kW", `${fint(DCON)} kW`);
  sub("1.149,8 kW", `${(ideal * 1.05).toFixed(1).replace(".", ",")} kW`);
  sub("1.149 kW", `${fint(DREG)} kW`);
  sub("1.020 kW", `${fint(DRP)} kW`);
  sub("1.079 kW", `${fint(fat.demandaRefPotenciaKw ?? DRP)} kW`);
  sub("95,91%", `${fmt(utilFp)}%`);
  sub("90,07%", `${fmt(utilPonta)}%`);
  sub("1.095 kW", `${fint(ideal)} kW`);
  sub("103 kW (8,60%)", `${fint(reducaoKw)} kW (${fmt((reducaoKw / DCON) * 100)}%)`);
  sub("R$ 1.368,87", `R$ ${fmt(economiaDemanda)}`);
  sub("R$ 16.426,44", `R$ ${fmt(economiaDemanda * 12)}`);

  if (ultraValor) {
    sub("Não identificada", `Sim — ${fint(ultraKw)} kW`);
    sub(
      "Sem ultrapassagem identificada.",
      `Ultrapassagem de ${fint(ultraKw)} kW faturada em dobro no ciclo (R$ ${fmt(ultraValor)}).`,
    );
    sub("Redução preliminar", "Ajuste preliminar (aumento)");
    sub("Contrato bem utilizado no mês.", "Contrato ESTOURADO no mês.");
    sub(
      "Não há folga excessiva neste mês.",
      "Registrada acima do contrato — excedente pago em dobro.",
    );
    sub(
      "bem dimensionada neste mês, sem ultrapassagem. Manter histórico antes de qualquer alteração contratual.",
      `com ULTRAPASSAGEM neste ciclo (${fint(DREG)} kW registrados para ${fint(
        DCON,
      )} contratados). Readequação contratual recomendada — economia líquida estimada de R$ ${fmt(
        economiaDemanda,
      )}/mês.`,
    );
    sub(
      "fatura bem controlada em demanda, mas com custo de ponta muito superior ao fora ponta",
      "fatura com ULTRAPASSAGEM de demanda e custo de ponta muito superior ao fora ponta",
    );
    rx(
      /apresenta boa utilização da demanda contratada e não demonstra, nesta referência, uma dor principal de ultrapassagem\./,
      `apresenta ULTRAPASSAGEM de demanda nesta referência (${fint(
        DREG,
      )} kW registrados para ${fint(DCON)} kW contratados) — readequação contratual recomendada.`,
    );
  }

  if (!ultraValor && util < 90) {
    sub("Contrato bem utilizado no mês.", "Contrato com folga no mês.");
    sub("Não há folga excessiva neste mês.", `Folga de ${fint(folga)} kW sobre o maior registro.`);
    sub(
      "bem dimensionada neste mês, sem ultrapassagem. Manter histórico antes de qualquer alteração contratual.",
      `com folga neste mês (${fint(DREG)} kW registrados para ${fint(
        DCON,
      )} kW contratados), sem ultrapassagem. Manter histórico antes de qualquer ajuste contratual.`,
    );
    sub(
      "fatura bem controlada em demanda, mas com custo de ponta muito superior ao fora ponta",
      "fatura com folga de demanda contratada e custo de ponta muito superior ao fora ponta",
    );
    rx(
      /apresenta boa utilização da demanda contratada e não demonstra, nesta referência, uma dor principal de ultrapassagem\./,
      `apresenta demanda contratada com folga (utilização de ${fmt(
        util,
      )}% no mês) e não demonstra, nesta referência, ultrapassagem.`,
    );
  }

  // Seção 4 — consumo.
  sub("42.835 kWh", `${fint(CP)} kWh`);
  sub("505.578 kWh", `${fint(CFP)} kWh`);
  sub("7,81%", `${fmt((CP / CONS) * 100)}%`);
  sub("R$ 75.726,71", `R$ ${fmt(V_P)}`);
  sub("R$ 195.522,17", `R$ ${fmt(V_FP)}`);
  sub("R$ 15.270,21", `R$ ${fmt(V_DEM)}`);
  const pctPonta = (V_P / TOTAL) * 100;
  const pctForaPonta = (V_FP / TOTAL) * 100;
  const pctDemanda = (V_DEM / TOTAL) * 100;
  sub("26,01%", `${fmt(pctPonta)}%`);
  sub("67,15%", `${fmt(pctForaPonta)}%`);
  sub("5,24%", `${fmt(pctDemanda)}%`);

  // Seção 5 — reativo, benefício e bandeira.
  const pctReativo = (reatValor / TOTAL) * 100;
  const pctBeneficio = (beneficio / TOTAL) * 100;
  sub("R$ 3.984,50", `R$ ${fmt(reatValor)}`);
  sub("R$ 521,16", `R$ ${fmt(reatPontaValor)}`);
  sub("R$ 3.463,34", `R$ ${fmt(reatFpValor)}`);
  sub("R$ 72.788,70", `R$ ${fmt(beneficio)}`);
  sub("1,37%", `${fmt(pctReativo)}%`);
  sub("25,00%", `${fmt(pctBeneficio)}%`);
  if (itemBandeira) sub("Verificar na tarifa", `R$ ${fmt(itemBandeira.valor)}`);
  else if (bandeiraNaoCobrada) sub("Verificar na tarifa", "Verde — R$ 0,00");
  else sub("Verificar na tarifa", "Sem adicional");

  if (reatValor === 0) {
    sub("Baixo impacto isolado.", "Sem cobrança nesta referência.");
    sub("Maior parte da cobrança reativa.", "Ufer zerado no ciclo.");
    sub(
      "Monitorar; não é a principal dor neste mês.",
      "Fator de potência adequado neste mês.",
    );
    sub(
      "cobrança existe, mas com baixo peso percentual. Recomenda-se monitoramento do fator de potência.",
      "sem cobrança nesta referência (Ufer zerado). Recomenda-se manter o monitoramento do fator de potência.",
    );
    rx(
      /A cobrança de reativo aparece em patamar baixo, com peso de/,
      "Não houve cobrança de energia reativa no ciclo, com peso de",
    );
    sub("rotina financeira e reativo", "rotina financeira e demanda contratada");
  }
  if (beneficio === 0) {
    sub("Valor relevante e deve ser protegido.", "PIS/COFINS a alíquota zero nesta fatura.");
    sub(
      "representa parcela relevante da fatura e deve ser acompanhado para evitar perda de vantagem tributária.",
      "PIS/COFINS a alíquota zero nesta referência; acompanhar a condição para evitar perda de vantagem tributária.",
    );
  }

  // Seção 7 — estudo.
  sub("R$ 59.161,13", `R$ ${fmt(mensal)}`);
  sub("R$ 709.933,58", `R$ ${fmt(economiaAno1)}`);
  sub("R$ 231.993,67", `R$ ${fmt(faturaComBess)}`);
  sub("20,32%", `${fmt(reducaoPercentual)}%`);
  sub("<b>1.428</b>", `<b>${fint(energiaDia)}</b>`);
  rx(
    /<span>Por energia<\/span><br><b>\d+<\/b>/,
    `<span>Por energia</span><br><b>${unidadesPorEnergia}</b>`,
  );
  rx(
    /<span>Por potência<\/span><br><b>\d+<\/b>/,
    `<span>Por potência</span><br><b>${unidadesPorPotencia}</b>`,
  );
  rx(
    /<span>Preliminar<\/span><br><b>\d+<\/b>/,
    `<span>Preliminar</span><br><b>${Math.max(unidadesPorEnergia, unidadesPorPotencia)}</b>`,
  );
  sub("10 unidades LUNA2000-241", `${unidadesBess} unidades LUNA2000-241`);
  sub(
    "<td>R$ 5.500.000,00</td><td>R$ 709.933,58</td><td>6,9 anos</td>",
    `<td>R$ ${fmt(capexBess)}</td><td>R$ ${fmt(economiaAno1Bess)}</td><td>${comUmaCasa(
      paybackAnosBess,
    )} anos</td>`,
  );
  sub("R$ -5.500.000,00", `R$ -${fmt(Math.abs(anuais[0]!))}`);

  // Decisão de 08/08: sem TMA no relatório — cartões iguais às tabelas.
  sub("VPL com TMA", "Acumulado em 20 anos");
  sub("Payback descontado", "Payback");
  sub(
    "VPL R$ 6.866.243,04; TIR 15,25% em 20 anos.",
    `TIR ${fmt((indicadoresBess.tir_aa ?? 0) * 100)}% ao ano; payback ${comUmaCasa(
      paybackAnosBess,
    )} anos; acumulado de R$ ${fmt(acumulado20Bess)} em 20 anos.`,
  );
  sub("R$ 6.866.243,04", `R$ ${fmt(acumulado20)}`);
  sub("15,25%", `${fmt((indicadores.tir_aa ?? 0) * 100)}%`);
  sub("8,4 anos", `${comUmaCasa(paybackAnos)} anos`);

  let premissas = "reajuste tarifário de 8% ao ano";
  if (peak) {
    premissas +=
      "; contrato de demanda de ponta remanescente de 30 kW (demanda mínima regulatória — REN ANEEL 1.000/2021); função PEAK SHAVING: o BESS assume a carga da janela de ponta e elimina a demanda de ponta medida";
  }
  if (ml) {
    premissas +=
      "; valores de kWh considerando os custos efetivos de TUSD + energia (TE ACL); usina dimensionada para recarga do BESS até as 15h no pior mês de irradiação";
  }
  sub("reajuste tarifário de 4% ao ano, TMA de 5% ao ano", premissas);

  if (peak) {
    sub(
      "limitado por potência, não apenas por energia.",
      `dimensionado para cobrir 100% da janela de ponta ATÉ O ANO 20 (degradação SOH a 64,5%), com potência de ${fint(
        unidadesBess * 241,
      )} kW para um pico de ${fint(DRP)} kW.`,
    );
  } else {
    sub(
      "limitado por potência, não apenas por energia.",
      "limitado por energia, com folga de potência para a demanda de ponta registrada.",
    );
  }

  rx(
    /<td>A dimensionar<\/td><td>A simular<\/td><td>A simular<\/td><td>[^<]*<\/td>/,
    `<td>R$ ${fmt(capexBess + entrada.capexSolarTotal)}</td><td>R$ ${fmt(
      economiaAno1,
    )}</td><td>${comUmaCasa(
      paybackAnos,
    )} anos</td><td>${unidadesBess} unidades LUNA2000-241 + usina solar de ${compacto(
      entrada.solarKwp,
    )} kWp dedicada à carga do BESS. TIR ${fmt(
      (indicadores.tir_aa ?? 0) * 100,
    )}% ao ano; acumulado de R$ ${fmt(acumulado20Solar)} em 20 anos.</td>`,
  );

  for (let i = 1; i < 20; i += 1) {
    sub(`R$ ${fmt(ECONOMIA_DO_MODELO[i]!)}`, `R$ ${fmt(economias[i]!)}`);
    sub(`R$ ${fmt(ACUMULADO_DO_MODELO[i]!)}`, `R$ ${fmt(acumulados[i]!)}`);
  }
  sub("R$ 15.640.457,93", `R$ ${fmt(acumulados[20]!)}`);

  // ---------- geometria dos cinco SVGs ----------
  const svgs = modelo.match(/<svg[\s\S]*?<\/svg>/g) ?? [];
  if (svgs.length !== 5) throw new CasoIncoerenteError("modelo sem os 5 svgs esperados");

  const eixo0 = CFP * 1.18;
  const barra = (rect: string, valor: number, eixo: number, antigo: string, novo: string): Barra => ({
    rect,
    altura: alturaDaBarra(valor, eixo),
    y: yDaBarra(valor, eixo),
    rotuloAntigo: antigo,
    rotuloNovo: novo,
  });

  const s0 = reescreverBarras(
    svgs[0]!,
    [
      barra(
        '<rect x="156.0" y="48.3" width="46.0" height="134.7" rx="5" fill="#2563eb"/>',
        CFP,
        eixo0,
        "505.578",
        fint(CFP),
      ),
      barra(
        '<rect x="218.0" y="171.6" width="46.0" height="11.4" rx="5" fill="#f59e0b"/>',
        CP,
        eixo0,
        "42.835",
        fint(CP),
      ),
      barra(
        '<rect x="280.0" y="182.7" width="46.0" height="0.3" rx="5" fill="#7c3aed"/>',
        DFAT,
        eixo0,
        "1.149",
        fint(DFAT),
      ),
    ],
    ["198.861", "397.721", "596.582"],
    [fint(eixo0 / 3), fint((eixo0 * 2) / 3), fint(eixo0)],
    [
      ["92,19%", `${fmt((CFP / CONS) * 100)}%`],
      ["7,81%", `${fmt((CP / CONS) * 100)}%`],
      ["0,23%", `${fmt((DFAT / CFP) * 100)}%`],
    ],
  );

  const eixo1 = Math.max(V_FP, V_P, V_DEM, reatValor, beneficio) * 1.18;
  const s1 = reescreverBarras(
    svgs[1]!,
    [
      barra(
        '<rect x="94.0" y="48.3" width="46.0" height="134.7" rx="5" fill="#2563eb"/>',
        V_FP,
        eixo1,
        "R$ 195.522,17",
        `R$ ${fmt(V_FP)}`,
      ),
      barra(
        '<rect x="156.0" y="130.8" width="46.0" height="52.2" rx="5" fill="#f59e0b"/>',
        V_P,
        eixo1,
        "R$ 75.726,71",
        `R$ ${fmt(V_P)}`,
      ),
      barra(
        '<rect x="218.0" y="172.5" width="46.0" height="10.5" rx="5" fill="#7c3aed"/>',
        V_DEM,
        eixo1,
        "R$ 15.270,21",
        `R$ ${fmt(V_DEM)}`,
      ),
      barra(
        '<rect x="280.0" y="180.3" width="46.0" height="2.7" rx="5" fill="#dc2626"/>',
        reatValor,
        eixo1,
        "R$ 3.984,50",
        `R$ ${fmt(reatValor)}`,
      ),
      barra(
        '<rect x="342.0" y="132.8" width="46.0" height="50.2" rx="5" fill="#0ea5e9"/>',
        beneficio,
        eixo1,
        "R$ 72.788,70",
        `R$ ${fmt(beneficio)}`,
      ),
    ],
    ["R$ 76.905,39", "R$ 153.810,77", "R$ 230.716,16"],
    [`R$ ${fmt(eixo1 / 3)}`, `R$ ${fmt((eixo1 * 2) / 3)}`, `R$ ${fmt(eixo1)}`],
    [
      ["67,15%", `${fmt(pctForaPonta)}%`],
      ["26,01%", `${fmt(pctPonta)}%`],
      ["5,24%", `${fmt(pctDemanda)}%`],
      ["1,37%", `${fmt(pctReativo)}%`],
      ["25,00%", `${fmt(pctBeneficio)}%`],
    ],
  );

  const eixo2 = TOTAL * 1.18;
  const s2 = reescreverBarras(
    svgs[2]!,
    [
      barra(
        '<rect x="156.0" y="48.3" width="46.0" height="134.7" rx="5" fill="#0f5740"/>',
        TOTAL,
        eixo2,
        "R$ 291.154,80",
        `R$ ${fmt(TOTAL)}`,
      ),
      barra(
        '<rect x="218.0" y="75.6" width="46.0" height="107.4" rx="5" fill="#16a34a"/>',
        faturaComBess,
        eixo2,
        "R$ 231.993,67",
        `R$ ${fmt(faturaComBess)}`,
      ),
      barra(
        '<rect x="280.0" y="155.6" width="46.0" height="27.4" rx="5" fill="#2563eb"/>',
        mensal,
        eixo2,
        "R$ 59.161,13",
        `R$ ${fmt(mensal)}`,
      ),
    ],
    ["R$ 114.520,89", "R$ 229.041,78", "R$ 343.562,66"],
    [`R$ ${fmt(eixo2 / 3)}`, `R$ ${fmt((eixo2 * 2) / 3)}`, `R$ ${fmt(eixo2)}`],
    [
      ["79,68%", `${fmt(100 - reducaoPercentual)}%`],
      ["20,32%", `${fmt(reducaoPercentual)}%`],
    ],
  );

  const eixo3 = economias[19]! * 1.12;
  let s3 = reescreverSerieAnual(svgs[3]!, economias, eixo3);
  const ticks3 = ["R$ 418.802,43", "R$ 837.604,87", "R$ 1.256.407,30", "R$ 1.675.209,74"];
  const novos3 = [fmt(eixo3 / 4), fmt(eixo3 / 2), fmt((eixo3 * 3) / 4), fmt(eixo3)];
  for (const [indice, antigo] of ticks3.entries()) {
    s3 = s3.split(`">${antigo}</text>`).join(`">R$ ${novos3[indice]}</text>`);
  }

  const eixo4 = Math.abs(acumulados[20]!);
  let s4 = reescreverSerieAcumulada(svgs[4]!, acumulados, eixo4);
  const ticks4 = [
    "R$ -15.640.457,93",
    "R$ -7.820.228,96",
    "R$ 7.820.228,96",
    "R$ 15.640.457,93",
  ];
  const novos4 = [
    `R$ -${fmt(eixo4)}`,
    `R$ -${fmt(eixo4 / 2)}`,
    `R$ ${fmt(eixo4 / 2)}`,
    `R$ ${fmt(eixo4)}`,
  ];
  for (const [indice, antigo] of ticks4.entries()) {
    s4 = s4.split(`">${antigo}</text>`).join(`">${novos4[indice]}</text>`);
  }

  for (const [indice, antigo] of svgs.entries()) {
    const novo = [s0, s1, s2, s3, s4][indice]!;
    if (antigo !== novo) S[antigo] = novo;
  }

  // ---------- O&M visível no relatório ----------
  const omBess = flx.ano1_base.om_bess;
  const omSolar = fs.solar.om_ano1;
  const omAno1 = omBess + omSolar;
  const om20 = somarComoOOraculo(
    Array.from({ length: 20 }, (_, i) => omAno1 * 1.03 ** i),
  );

  const blocoOm =
    "<h3>Custos de operação e manutenção (O&amp;M)</h3>" +
    "<p>Para o sistema entregar a economia projetada pelos 20 anos, a operação e manutenção é parte do investimento — monitoramento, limpeza, inspeções e manutenção preventiva do BESS e da usina solar. Estes custos já estão descontados de TODOS os valores de economia deste relatório.</p>" +
    "<table><thead><tr><th>Item</th><th>Custo ano 1</th><th>Base de cálculo</th><th>Reajuste</th></tr></thead><tbody>" +
    `<tr><td>O&amp;M BESS</td><td>R$ ${fmt(omBess)}</td><td>1% do CAPEX do BESS ao ano</td><td>3% a.a.</td></tr>` +
    `<tr><td>O&amp;M Solar</td><td>R$ ${fmt(omSolar)}</td><td>1% do CAPEX da usina ao ano</td><td>3% a.a.</td></tr>` +
    `<tr><td><b>Total ano 1</b></td><td><b>R$ ${fmt(omAno1)}</b></td><td>≈ R$ ${fmt(
      omAno1 / 12,
    )} por mês</td><td>—</td></tr></tbody></table>` +
    `<p>O&amp;M total projetado nos 20 anos: <b>R$ ${fmt(
      om20,
    )}</b>. A economia líquida acumulada de R$ ${fmt(acumulado20)} já considera esse custo.</p>`;

  const manterMarcadores = fat.distribuidora.toLowerCase().includes("roraima")
    ? ["Roraima", "Boa Vista"]
    : [];

  const insercoes: CasoDoRelatorio["insercoes"] = [];
  if (peak) {
    const blocoPeak =
      "<h3>Função do sistema: PEAK SHAVING (não é load shifting)</h3>" +
      "<p>Nas demais unidades da rede o BESS faz <b>load shifting</b>: compra energia barata fora ponta e devolve na ponta cara. " +
      "Nesta unidade (modalidade AZUL) o consumo custa o MESMO na ponta e fora dela — o custo está na <b>demanda de ponta: " +
      `R$ ${fmt(fat.tarifaKwPontaMedida ?? 0)}/kW</b>. A função aqui é <b>PEAK SHAVING</b>: o BESS ` +
      "assume 100% da carga na janela de ponta, a demanda de ponta medida vai a ~zero e o contrato cai de " +
      `${fint(DCON)} kW para o mínimo regulatório de 30 kW (REN ANEEL 1.000/2021). A economia é a ` +
      `conta de demanda de ponta que deixa de existir: <b>R$ ${fmt(
        (fat.demandaPontaValorTotal ?? 0) - 30 * (fat.tarifaKwPontaNc ?? 0),
      )} por mês</b>.</p>` +
      "<p>Requisitos de projeto: SOC 100% no início de cada janela de ponta; recarga limitada à folga de demanda fora ponta + geração solar; dimensionamento com garantia de cobertura até o ano 20 (degradação SOH).</p>";
    insercoes.push({ antesDe: "<h3>Economia anual projetada", html: blocoPeak });
  }

  if (ml && nf) {
    const blocoMl =
      "<h3>Mercado Livre — custo efetivo da energia (TUSD + TE ACL)</h3>" +
      "<p>Unidade no Mercado Livre: paga o uso do fio (TUSD) à distribuidora e compra a energia por contrato ACL. Os valores por kWh deste estudo consideram os CUSTOS EFETIVOS: TUSD com impostos + energia da nota fiscal de fornecimento (valor total com impostos ÷ volume).</p>" +
      "<table><thead><tr><th>Componente</th><th>Valor</th><th>Base de cálculo</th></tr></thead><tbody>" +
      `<tr><td>Energia ACL — ${nf.fornecedor}</td><td>R$ ${comSeisCasas(
        nf.precoKwh,
      )}/kWh</td><td>NF R$ ${fmt(nf.total)} ÷ ${comTresCasas(nf.mwh)} MWh</td></tr>` +
      `<tr><td><b>Custo efetivo ponta</b></td><td><b>R$ ${comSeisCasas(
        fat.tarifaPontaTotal ?? 0,
      )}/kWh</b></td><td>TUSD ${comSeisCasas(TAR_P)} + energia</td></tr>` +
      `<tr><td>Custo efetivo fora ponta</td><td>R$ ${comSeisCasas(
        fat.tarifaFpTotal ?? 0,
      )}/kWh</td><td>TUSD ${comSeisCasas(TAR_FP)} + energia</td></tr>` +
      `<tr><td>Gasto total do mês (fio + notas)</td><td>R$ ${fmt(
        fat.totalGastoEnergia ?? 0,
      )}</td><td>referência ${fat.referencia}</td></tr></tbody></table>` +
      "<p>Créditos APCEI (benefício da energia incentivada), débitos e lançamentos de outras competências não integram o estudo.</p>";
    insercoes.push({ antesDe: "<h3>Economia anual projetada", html: blocoMl });
  }

  insercoes.push({ antesDe: "<h3>Economia anual projetada", html: blocoOm });

  return { substituicoes: S, manterMarcadores, insercoes };
}
