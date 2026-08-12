import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  avaliarConciliacaoLocal,
  camposDaFicha,
  type InvoiceContext,
  itensParaConciliar,
} from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { conciliarFatura } from "../nucleo/conciliacao.js";
import {
  casoDoMotorDaFatura,
  faturaNormativaDoSistema,
} from "../nucleo/da-fatura-do-sistema.js";
import type { SaidaDoMotor } from "../nucleo/motor.js";
import { rodarEstudo } from "../nucleo/pipeline.js";
import { avisoDeCorpusAusente, fixtureDoCorpus } from "./corpus.js";
import { lerPorRegras, type LeituraDaFatura } from "./leitura.js";

/**
 * A costura que começa quando o botão acende.
 *
 * Os testes do leitor provam a página e os testes dos motores provam casos já
 * montados. Este arquivo liga os dois sem banco nem uma cópia da lógica da
 * tela: página congelada -> leitor -> funções compartilhadas da conciliação ->
 * FaturaNormativa -> Trava 1 -> caso do motor -> pipeline.
 */

const SANTA = fixtureDoCorpus("roraima-santa-tereza-2026-06.pagina.json");
const CANTUARIA = fixtureDoCorpus("energisa-ro-cantuaria-2026-06.pagina.json");

if (!SANTA || !CANTUARIA) {
  console.warn(avisoDeCorpusAusente("Santa Tereza e Cantuária para a costura até o motor"));
}

const CASOS = join(
  __dirname,
  "../../../../../packages/auditoria-oraculo/referencia",
  "skill-estudo-eficiencia-energetica/casos",
);

function golden(arquivo: string): SaidaDoMotor {
  return JSON.parse(readFileSync(join(CASOS, arquivo), "utf8")) as SaidaDoMotor;
}

function fichaDaTela(leitura: LeituraDaFatura) {
  const ficha = Object.fromEntries(
    Object.entries(leitura.invoice).map(([campo, valor]) => [campo, String(valor ?? 0)]),
  );
  return avaliarConciliacaoLocal(itensParaConciliar(leitura.itens), camposDaFicha(ficha));
}

function montar(
  leitura: LeituraDaFatura,
  contexto: Omit<InvoiceContext, "itens" | "origem" | "grupo" | "distribuidora">,
) {
  const avaliacao = fichaDaTela(leitura);
  expect(avaliacao.pronta).toBe(true);

  const invoice = camposDaFicha(
    Object.fromEntries(
      Object.entries(leitura.invoice).map(([campo, valor]) => [campo, String(valor ?? 0)]),
    ),
  );
  const competencia = leitura.identificacao.competencia;
  if (!competencia) throw new Error("competência ausente na leitura provada");

  const fatura = faturaNormativaDoSistema(
    invoice,
    {
      ...contexto,
      distribuidora: leitura.identificacao.distribuidora ?? "Distribuidora não identificada",
      grupo: "A",
      origem: leitura.origem,
      itens: avaliacao.itens,
      demandaComplementoValor: leitura.demandaComplementoValor,
    },
    {
      cliente: "Mercantil Nova Era Ltda",
      unidadeConsumidora: leitura.identificacao.unidadeConsumidora ?? "UC não identificada",
      mesDeCompetencia: competencia.mes,
      anoDeCompetencia: competencia.ano,
    },
  );

  expect(conciliarFatura(fatura).conciliada).toBe(true);
  return fatura;
}

describe.skipIf(!SANTA || !CANTUARIA)("da página conciliada até o motor", () => {
  it("Santa Tereza chega ao Solar+BESS e reproduz o fluxo golden", () => {
    const leitura = lerPorRegras(SANTA!);
    const fatura = montar(leitura, {
      regime: "cativo",
      modalidade: "verde",
      vencimento: "17/07/2026",
      hspMensal: Array.from({ length: 12 }, () => 5),
      arquivoNome: null,
      arquivoChave: null,
    });

    const caso = casoDoMotorDaFatura(fatura, Array.from({ length: 12 }, () => 5));
    const estudo = rodarEstudo(caso);

    expect(caso).toMatchObject({
      funcao: "solar_bess",
      consumoPontaDesejadoKwhMes: 17_419,
      capexBessTotal: 2_200_000,
      tusdP: 2.689175,
      tusdFp: 0.625962,
    });
    expect(estudo.fluxoSolar).toEqual(golden("fluxo-santa-tereza-solar.json"));
  });

  it("Cantuária preserva as duas parcelas de demanda e roda peak shaving sem zeros", () => {
    const leitura = lerPorRegras(CANTUARIA!);
    const fatura = montar(leitura, {
      regime: "mercado_livre",
      modalidade: "azul",
      vencimento: "17/07/2026",
      hspMensal: Array.from({ length: 12 }, () => 4.5),
      arquivoNome: null,
      arquivoChave: null,
    });

    expect(fatura).toMatchObject({
      funcao: "peak_shaving",
      demandaRegistradaPontaKw: 272,
      demandaContratadaKw: 360,
      demandaPontaValorTotal: 45_958.37,
      tarifaKwPontaMedida: 134.05198,
      tarifaKwPontaNc: 107.91184,
    });

    const caso = casoDoMotorDaFatura(fatura, Array.from({ length: 12 }, () => 4.5));
    expect(caso).toMatchObject({
      funcao: "peak_shaving",
      demandaPontaMedidaKw: 272,
      tarifaKwPontaMedida: 134.05198,
      demandaPontaNcKw: 88,
      tarifaKwPontaNc: 107.91184,
      capexBessTotal: null,
    });

    const estudo = rodarEstudo(caso);
    expect(estudo.modo).toBe("peak_shaving");
    expect(estudo.fluxoBess.dimensionamento.n_bess_adotado).toBe(5);
    // O motor usa quantidade × tarifa (45.958,38048 -> 45.958,38); a linha
    // impressa acima soma 45.958,37 e continua preservada na fatura.
    expect(estudo.fluxoBess.ano1_base.economia_demanda_mes).toBe(45_958.38);
    expect(estudo.fluxoBess.indicadores.capex_total).toBe(2_750_000);
  });
});
