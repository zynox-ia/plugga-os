import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { rodarPeakShaving, type PremissasDoPeakShaving } from "./motor-peak-shaving.js";
import { rodarSolarBess, type PremissasDoMotor } from "./motor-solar-bess.js";
import type { SaidaDoMotor } from "./motor.js";
import { rodarEstudo, type CasoDoEstudo } from "./pipeline.js";

/**
 * Paridade dos motores contra o oráculo Python, caso a caso.
 *
 * Fica atrás de `RUN_ORACULO_TESTS=true` porque o Python não faz parte do
 * runtime: a suíte padrão precisa passar em qualquer máquina. Rodar com
 *
 *     RUN_ORACULO_TESTS=true pnpm --filter @plugga/api test motores.oraculo
 *
 * O que se prova aqui é mais forte que um golden guardado: para cada um dos 27
 * casos do corpus, o oráculo roda agora e a saída inteira — dimensionamento,
 * ano 1, solar, indicadores, 21 fluxos anuais e 240 meses — tem que ser igual.
 */
const ligado = process.env.RUN_ORACULO_TESTS === "true";

const REFERENCIA = join(
  __dirname,
  "../../../../../packages/auditoria-oraculo/referencia",
  "skill-estudo-eficiencia-energetica",
);
const ASSETS = join(REFERENCIA, "assets");
const CASOS = join(REFERENCIA, "casos");

const temporarios: string[] = [];

afterAll(() => {
  for (const dir of temporarios) rmSync(dir, { recursive: true, force: true });
});

type CasoDoCorpus = Record<string, unknown>;

function lerCaso(arquivo: string): CasoDoCorpus {
  return JSON.parse(readFileSync(join(CASOS, arquivo), "utf8")) as CasoDoCorpus;
}

/** Roda o motor do oráculo a partir de um destino temporário. */
function rodarOraculo(script: string, arquivoDoCaso: string): SaidaDoMotor {
  const destino = mkdtempSync(join(tmpdir(), "motor-"));
  temporarios.push(destino);
  const saida = join(destino, "fluxo.json");

  execFileSync(
    "python3",
    [join(ASSETS, script), "--caso", join(CASOS, arquivoDoCaso), "--saida", saida],
    { env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }, stdio: "pipe" },
  );

  return JSON.parse(readFileSync(saida, "utf8")) as SaidaDoMotor;
}

/**
 * O corpus é `snake_case` e o motor em TypeScript é `camelCase`. A tradução é
 * explícita, campo a campo: um mapeamento automático aceitaria em silêncio uma
 * chave que o motor não conhece, e o caso passaria com a premissa padrão.
 */
const DE_PARA_SOLAR: Record<string, keyof PremissasDoMotor> = {
  consumo_ponta_desejado_kwh_mes: "consumoPontaDesejadoKwhMes",
  n_bess: "nBess",
  capex_bess_total: "capexBessTotal",
  tusd_p: "tusdP",
  te_p: "teP",
  tusd_fp: "tusdFp",
  te_fp: "teFp",
  hsp_mensal: "hspMensal",
  solar_kwp: "solarKwp",
  capex_solar_total: "capexSolarTotal",
  solar_pr: "solarPr",
  om_bess_ano1: "omBessAno1",
  limitar_utilizacao_ao_consumo: "limitarUtilizacaoAoConsumo",
  solar_apenas_carrega_bess: "solarApenasCarregaBess",
};

const DE_PARA_PEAK: Record<string, keyof PremissasDoPeakShaving> = {
  consumo_ponta_desejado_kwh_mes: "consumoPontaDesejadoKwhMes",
  n_bess: "nBess",
  capex_bess_total: "capexBessTotal",
  capex_unitario: "capexUnitario",
  tusd_p: "tusdP",
  te_p: "teP",
  tusd_fp: "tusdFp",
  te_fp: "teFp",
  hsp_mensal: "hspMensal",
  solar_kwp: "solarKwp",
  capex_solar_total: "capexSolarTotal",
  solar_pr: "solarPr",
  demanda_ponta_medida_kw: "demandaPontaMedidaKw",
  tarifa_kw_ponta_medida: "tarifaKwPontaMedida",
  demanda_ponta_nc_kw: "demandaPontaNcKw",
  tarifa_kw_ponta_nc: "tarifaKwPontaNc",
  contrato_ponta_novo_kw: "contratoPontaNovoKw",
};

/** Chaves do corpus que o motor não lê: são metadados do pipeline. */
const IGNORADAS = new Set(["funcao", "solar_kwp_definido", "observacao", "obs"]);

function traduzir<T>(caso: CasoDoCorpus, dePara: Record<string, keyof T>): Partial<T> {
  const traduzido: Record<string, unknown> = {};

  for (const [chave, valor] of Object.entries(caso)) {
    if (IGNORADAS.has(chave)) continue;
    const destino = dePara[chave];
    expect(destino, `chave do corpus sem tradução: ${chave}`).toBeDefined();
    traduzido[destino as string] = valor;
  }

  return traduzido as Partial<T>;
}

const casosSolar = ligado
  ? readdirSync(CASOS)
      .filter((nome) => nome.startsWith("caso-motor-") && nome.endsWith(".json"))
      .filter((nome) => lerCaso(nome).funcao !== "peak_shaving")
      .sort()
  : [];

describe.skipIf(!ligado)("motores contra o oráculo", () => {
  it("o corpus tem 26 casos Solar+BESS e 1 de peak shaving", () => {
    const todos = readdirSync(CASOS).filter(
      (nome) => nome.startsWith("caso-motor-") && nome.endsWith(".json"),
    );

    expect(todos).toHaveLength(27);
    expect(casosSolar).toHaveLength(26);
  });

  it.each(casosSolar)("%s reproduz o oráculo inteiro", (arquivo) => {
    const esperado = rodarOraculo("motor_bess_solar.py", arquivo);

    const obtido = rodarSolarBess(traduzir<PremissasDoMotor>(lerCaso(arquivo), DE_PARA_SOLAR));

    expect(obtido).toEqual(esperado);
  });

  it("Cantuária reproduz o oráculo do peak shaving", () => {
    const arquivo = "caso-motor-cantuaria.json";
    const esperado = rodarOraculo("motor_peak_shaving.py", arquivo);

    const obtido = rodarPeakShaving(
      traduzir<PremissasDoPeakShaving>(lerCaso(arquivo), DE_PARA_PEAK),
    );

    expect(obtido).toEqual(esperado);
  });

  it("Cantuária no motor errado dá outro estudo — por isso o modo não tem padrão", () => {
    const caso = lerCaso("caso-motor-cantuaria.json");

    const peak = rodarPeakShaving(traduzir<PremissasDoPeakShaving>(caso, DE_PARA_PEAK));
    // De propósito sem as chaves de demanda: é o que sobra quando um caso de
    // peak shaving cai no motor de Solar+BESS, que não sabe o que fazer com
    // elas. O estudo resultante é outro — e é por isso que o modo não pode ter
    // padrão nem fallback.
    const solar = rodarSolarBess({
      consumoPontaDesejadoKwhMes: caso.consumo_ponta_desejado_kwh_mes as number,
      nBess: caso.n_bess as number | null,
      capexBessTotal: (caso.capex_bess_total as number | null) ?? 3_500_000,
      tusdP: caso.tusd_p as number,
      teP: caso.te_p as number,
      tusdFp: caso.tusd_fp as number,
      teFp: caso.te_fp as number,
      hspMensal: caso.hsp_mensal as number[],
      solarKwp: 0,
      capexSolarTotal: 0,
    });

    expect(peak.dimensionamento.n_bess_adotado).not.toBe(
      solar.dimensionamento.n_bess_adotado,
    );
    expect(peak.indicadores.tir_aa).not.toBe(solar.indicadores.tir_aa);
  });
});

/**
 * Paridade do pipeline, não só dos motores.
 *
 * Aqui as duas passagens do oráculo são reproduzidas literalmente: roda o motor
 * sem solar, lê o kWp sugerido do pior mês, grava um caso novo com o solar
 * derivado a R$ 2.500/kWp e roda de novo. É esse segundo fluxo que vira o
 * estudo do cliente — e é ele que o TypeScript precisa reproduzir.
 */
describe.skipIf(!ligado)("pipeline contra o oráculo", () => {
  function duasPassagensNoOraculo(arquivo: string): SaidaDoMotor {
    const caso = lerCaso(arquivo);
    const script =
      caso.funcao === "peak_shaving" ? "motor_peak_shaving.py" : "motor_bess_solar.py";

    const primeira = rodarOraculo(script, arquivo);
    const kwp =
      (caso.solar_kwp_definido as number | undefined) ||
      primeira.solar.kwp_sugerido_pior_mes!;

    const destino = mkdtempSync(join(tmpdir(), "pipeline-"));
    temporarios.push(destino);
    const casoSolar = join(destino, "caso.json");
    const saida = join(destino, "fluxo.json");
    writeFileSync(
      casoSolar,
      JSON.stringify({
        ...caso,
        solar_kwp: kwp,
        capex_solar_total: Math.round(kwp * 2500 * 100) / 100,
      }),
      "utf8",
    );

    execFileSync("python3", [join(ASSETS, script), "--caso", casoSolar, "--saida", saida], {
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      stdio: "pipe",
    });

    return JSON.parse(readFileSync(saida, "utf8")) as SaidaDoMotor;
  }

  const todos = ligado
    ? readdirSync(CASOS)
        .filter((nome) => nome.startsWith("caso-motor-") && nome.endsWith(".json"))
        .sort()
    : [];

  it.each(todos)("%s: o fluxo Solar do pipeline é o do oráculo", (arquivo) => {
    const caso = lerCaso(arquivo);
    const ehPeak = caso.funcao === "peak_shaving";
    const traduzido = ehPeak
      ? traduzir<PremissasDoPeakShaving>(caso, DE_PARA_PEAK)
      : traduzir<PremissasDoMotor>(caso, DE_PARA_SOLAR);

    const estudo = rodarEstudo({
      ...(traduzido as CasoDoEstudo),
      funcao: ehPeak ? "peak_shaving" : "solar_bess",
      ...(caso.solar_kwp_definido === undefined
        ? {}
        : { solarKwpDefinido: caso.solar_kwp_definido as number }),
    });

    expect(estudo.fluxoSolar).toEqual(duasPassagensNoOraculo(arquivo));
  });
});
