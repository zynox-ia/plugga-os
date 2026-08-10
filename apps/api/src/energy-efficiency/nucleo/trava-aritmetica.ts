import type { FaturaNormativa } from "@plugga/shared";

import { arredondar, somarComoOOraculo } from "./aritmetica.js";
import { comUmaCasa, fint, fmt } from "./formato.js";
import type { SaidaDoMotor } from "./motor.js";
import { lerModeloOficial } from "./relatorio-literal.js";

/**
 * TRAVA 2 — verificador aritmético do relatório final.
 *
 * Port fiel de `assets/verificar_relatorio.py`. Ele lê o HTML pronto e refaz as
 * contas de trás para frente, a partir das duas únicas fontes de verdade: a
 * fatura conciliada e o fluxo do motor. Qualquer divergência acima de um
 * centavo, ou uma linha ausente, significa não entregar.
 *
 * A diferença entre isto e o gerador é o ponto: o gerador garante o documento
 * por construção; esta trava garante por verificação. Um erro no construtor —
 * uma chave trocada, um número formatado errado — passaria despercebido pelo
 * primeiro e é pego aqui.
 *
 * É defesa em profundidade, e por isso reconfere também estrutura e resíduo do
 * caso-fonte, que o gerador já conferiu.
 */

/** Lista curta do verificador: não inclui a distribuidora do caso-fonte. */
const MARCADORES_DO_CASO_FONTE = [
  "Serra Verde",
  "SERRA VERDE",
  "AGROINDUSTRIAL",
  "0188872",
  "R$ 291.154",
  "548.413 kWh",
  "R$ 72.788",
  "R$ 3.984,50",
  "06/2025",
] as const;

const MINIMO_DE_TITULOS = 10;

export type ResultadoDaTrava2 = {
  aprovado: boolean;
  problemas: string[];
  /** Quantas conferências foram feitas — entra na prova guardada. */
  verificacoes: number;
};

function cssDe(texto: string): string {
  const encontrado = /<style[^>]*>([\s\S]*?)<\/style>/.exec(texto);
  return encontrado ? encontrado[1]! : "";
}

export function verificarRelatorio(entrada: {
  html: string;
  fatura: FaturaNormativa;
  /** O fluxo apresentado — o Solar, não o BESS puro. */
  fluxo: SaidaDoMotor;
  conciliada: boolean;
  modelo?: string;
}): ResultadoDaTrava2 {
  const { html, fatura, fluxo } = entrada;
  const problemas: string[] = [];
  let verificacoes = 0;

  const deveConter = (texto: string, motivo: string): void => {
    verificacoes += 1;
    if (!html.includes(texto)) {
      problemas.push(`ausente no HTML: ${JSON.stringify(texto)} (${motivo})`);
    }
  };

  // 1) A fatura tem que ter passado pela Trava 1, e fechar de novo aqui.
  if (!entrada.conciliada) {
    problemas.push("fatura não passou pela trava 1");
  }
  const soma = somarComoOOraculo(fatura.itens.map((item) => item.valor));
  if (Math.abs(soma - fatura.total) > 0.01) {
    problemas.push(
      `fatura: soma dos itens ${fmt(soma)} != total ${fmt(fatura.total)}`,
    );
  }
  const consumo = fatura.consumoPontaKwh + fatura.consumoFpKwh;

  // 2) Os números da fatura que aparecem no documento.
  deveConter(fmt(fatura.total), "valor total da fatura");
  deveConter(`${fint(consumo)} kWh`, "consumo total");
  deveConter(
    `R$ ${fmt(fatura.total / consumo).replace(/\./g, "")}/kWh`,
    "custo médio total = total ÷ consumo",
  );
  deveConter(fatura.referencia, "referência");
  deveConter(fatura.vencimento, "vencimento");
  deveConter(fatura.cliente.toUpperCase(), "nome do cliente");
  deveConter(String(fatura.uc), "unidade consumidora");

  // 3) Peso de cada item relevante — valor e percentual.
  for (const item of fatura.itens) {
    const nome = item.nome.toLowerCase();
    if (
      nome.includes("cosip") ||
      nome.includes("ilum") ||
      nome.includes("apcei") ||
      nome.includes("ultrapassagem")
    ) {
      continue;
    }
    if (item.valor / fatura.total >= 0.01) {
      deveConter(fmt(item.valor), `valor do item ${item.nome}`);
      deveConter(
        `${fmt((item.valor / fatura.total) * 100)}%`,
        `peso do item ${item.nome}`,
      );
    }
  }

  // 4 e 5) A tabela de 20 anos é o fluxo do motor, linha a linha, e o
  // acumulado tem que ser coerente consigo mesmo.
  const anuais = fluxo.fluxo_anual;
  if (anuais.length !== 21) {
    problemas.push("fluxo do motor sem 21 posições (ano 0 + 20 anos)");
  }
  const economias = anuais.slice(1);
  const acumulados: number[] = [anuais[0] ?? 0];
  for (const valor of economias) {
    acumulados.push(arredondar(acumulados[acumulados.length - 1]! + valor, 2));
  }
  economias.forEach((valor, indice) => {
    deveConter(fmt(valor), `economia do ano ${indice + 1} (motor)`);
  });
  acumulados.slice(1).forEach((valor, indice) => {
    deveConter(fmt(valor), `acumulado do ano ${indice + 1} (motor)`);
  });
  deveConter(fmt(Math.abs(anuais[0] ?? 0)), "CAPEX (ano 0)");

  // 6) Os cartões do estudo.
  const economiaAno1 = economias[0] ?? 0;
  const mensal = economiaAno1 / 12;
  deveConter(fmt(economiaAno1), "economia do ano 1");
  deveConter(fmt(mensal), "economia média mensal = ano 1 ÷ 12");
  deveConter(fmt(fatura.total - mensal), "fatura com BESS = total − mensal");
  deveConter(`${fmt((mensal / fatura.total) * 100)}%`, "redução percentual");

  const indicadores = fluxo.indicadores;
  // Decisão de 08/08: o relatório não traz TMA nem VPL; confere-se TIR,
  // payback simples e o acumulado, que a tabela de 20 anos já cobre.
  deveConter(`${fmt((indicadores.tir_aa ?? 0) * 100)}%`, "TIR do motor");
  if (indicadores.payback_meses) {
    deveConter(
      `${comUmaCasa(indicadores.payback_meses / 12)} anos`,
      "payback do motor",
    );
  }

  // 7) Estrutura: CSS do modelo, seções presentes, nada do caso-fonte.
  const modelo = entrada.modelo ?? lerModeloOficial();
  if (cssDe(html) !== cssDe(modelo)) {
    problemas.push("o CSS principal difere do modelo congelado");
  }
  const semEstilo = html.replace(/<style[\s\S]*?<\/style>/g, "");
  const titulos = semEstilo.match(/<h[12][ >]/g)?.length ?? 0;
  if (titulos < MINIMO_DE_TITULOS) {
    problemas.push(`menos de ${MINIMO_DE_TITULOS} títulos h1/h2 (${titulos}) — seção sumiu?`);
  }
  for (const marcador of MARCADORES_DO_CASO_FONTE) {
    if (html.includes(marcador)) {
      problemas.push(`marcador do caso-fonte presente: ${marcador}`);
    }
  }

  return { aprovado: problemas.length === 0, problemas, verificacoes };
}
