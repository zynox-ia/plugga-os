import {
  COMPRAS_SLA_DIAS_UTEIS,
  type ComprasEtapaMensurada,
  type ComprasOrigemAtendimento,
  type SituacaoPrazo,
} from "@plugga/shared";

/**
 * Contagem de prazos em dias úteis para o POP-COMP-001 §3.
 *
 * Módulo puro, sem Nest: a régua de prazos é a parte do processo que mais custa
 * caro se estiver errada — ela alimenta os indicadores 4.2 e 4.3 — e precisa ser
 * testável sem subir aplicação nem banco.
 *
 * **Dia útil é segunda a sexta.** O POP diz apenas "dias úteis" e não traz
 * calendário de feriados; nenhum é inventado aqui. Isso é escolha operacional,
 * não consequência do documento, e tem um custo conhecido: feriado nacional ou
 * estadual conta como dia útil e encurta o prazo real. Introduzir feriados
 * depois muda `prazo_em` já gravado e exige backfill — não é troca gratuita.
 *
 * Armazenamento em UTC, calendário em America/Manaus (`docs/AGENT.md`).
 */

const FUSO = "America/Manaus";

/**
 * Fim do expediente, hora de Manaus. Existe para "vence hoje" não depender do
 * minuto em que a etapa foi aberta: um card aberto às 17h e outro às 9h do
 * mesmo dia vencem juntos, que é como uma pessoa lê um prazo em dias.
 *
 * É escolha operacional — o POP não define horário de expediente.
 */
export const HORA_FIM_DO_EXPEDIENTE = 18;

const formatador = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

type PartesLocais = {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
};

function partesLocais(instante: Date): PartesLocais {
  const partes = formatador.formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes): number => {
    const encontrada = partes.find((parte) => parte.type === tipo);
    return encontrada ? Number(encontrada.value) : 0;
  };
  // `hour12: false` devolve 24 para a meia-noite em alguns ambientes.
  const hora = valor("hour") % 24;
  return {
    ano: valor("year"),
    mes: valor("month"),
    dia: valor("day"),
    hora,
    minuto: valor("minute"),
    segundo: valor("second"),
  };
}

/**
 * Instante UTC de uma data/hora local de Manaus.
 *
 * Duas passadas em vez de somar um deslocamento fixo: Manaus não tem horário de
 * verão hoje, mas fixar −04:00 no código transformaria uma futura mudança de
 * regra de fuso em prazos silenciosamente errados.
 */
function instanteLocal(ano: number, mes: number, dia: number, hora: number): Date {
  const palpite = Date.UTC(ano, mes - 1, dia, hora, 0, 0);
  const lidoNoFuso = partesLocais(new Date(palpite));
  const comoSeFosseUtc = Date.UTC(
    lidoNoFuso.ano,
    lidoNoFuso.mes - 1,
    lidoNoFuso.dia,
    lidoNoFuso.hora,
    lidoNoFuso.minuto,
    lidoNoFuso.segundo,
  );
  const deslocamentoMs = comoSeFosseUtc - palpite;
  return new Date(palpite - deslocamentoMs);
}

/** Dia do calendário em Manaus, como número comparável (AAAAMMDD). */
function diaOrdinal(partes: { ano: number; mes: number; dia: number }): number {
  return partes.ano * 10000 + partes.mes * 100 + partes.dia;
}

function ehDiaUtil(ano: number, mes: number, dia: number): boolean {
  const diaDaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return diaDaSemana >= 1 && diaDaSemana <= 5;
}

function proximoDia(ano: number, mes: number, dia: number): { ano: number; mes: number; dia: number } {
  const seguinte = new Date(Date.UTC(ano, mes - 1, dia + 1));
  return {
    ano: seguinte.getUTCFullYear(),
    mes: seguinte.getUTCMonth() + 1,
    dia: seguinte.getUTCDate(),
  };
}

/**
 * Data/hora em que um prazo de `dias` dias úteis vence, contado a partir de
 * `inicio`. O dia de início não conta: abrir uma etapa hoje com 2 dias úteis
 * vence no fim do segundo dia útil **seguinte**.
 */
export function adicionaDiasUteis(inicio: Date, dias: number): Date {
  if (dias < 1) {
    throw new Error("prazo em dias úteis precisa ser pelo menos 1");
  }
  let { ano, mes, dia } = partesLocais(inicio);
  let restantes = dias;
  while (restantes > 0) {
    ({ ano, mes, dia } = proximoDia(ano, mes, dia));
    if (ehDiaUtil(ano, mes, dia)) {
      restantes -= 1;
    }
  }
  return instanteLocal(ano, mes, dia, HORA_FIM_DO_EXPEDIENTE);
}

/**
 * Dias úteis decorridos entre dois instantes, contando os dias úteis do
 * intervalo `(inicio, fim]`. Entrar numa segunda e sair na quarta são dois dias
 * úteis. Usado pelo Indicador Cruzado do POP §4.3.
 */
export function diasUteisEntre(inicio: Date, fim: Date): number {
  if (fim <= inicio) {
    return 0;
  }
  const partesInicio = partesLocais(inicio);
  const limite = diaOrdinal(partesLocais(fim));
  let cursor = { ano: partesInicio.ano, mes: partesInicio.mes, dia: partesInicio.dia };
  let total = 0;
  while (true) {
    cursor = proximoDia(cursor.ano, cursor.mes, cursor.dia);
    if (diaOrdinal(cursor) > limite) {
      return total;
    }
    if (ehDiaUtil(cursor.ano, cursor.mes, cursor.dia)) {
      total += 1;
    }
  }
}

export type PrazoDaEtapa = { prazoDiasUteis: number; prazoEm: Date };

/**
 * Prazo de uma etapa, conforme a tabela do POP §3.
 *
 * A retirada é a única com prazo variável: o POP a define como "5 dias úteis ou
 * mais, dependendo do cronograma de fornecedor externo (ex.: Solar)". O
 * cronograma do fornecedor é o prazo que ele próprio declarou na cotação
 * escolhida, então é dali que a extensão sai — e só na aquisição externa,
 * porque retirar material que já está no estoque não depende de fornecedor
 * nenhum. O fluxograma imprime "5 dias úteis ou mais" nos dois ramos; entre o
 * desenho e a causa que os dois documentos dão por escrito, vale a causa.
 *
 * O prazo declarado pelo fornecedor é lido **em dias úteis**, como todo o resto
 * da régua do §3. Misturar unidades num mesmo prazo seria pior do que assumir
 * uma: o indicador 4.3 compara etapas entre si.
 */
export function prazoDaEtapa(entrada: {
  etapa: ComprasEtapaMensurada;
  entrouEm: Date;
  origemAtendimento?: ComprasOrigemAtendimento | null;
  prazoFornecedorDias?: number | null;
}): PrazoDaEtapa {
  const base = COMPRAS_SLA_DIAS_UTEIS[entrada.etapa];
  const estendePelaRetirada =
    entrada.etapa === "retirada" &&
    entrada.origemAtendimento === "aquisicao" &&
    typeof entrada.prazoFornecedorDias === "number" &&
    entrada.prazoFornecedorDias > base;

  const prazoDiasUteis = estendePelaRetirada ? (entrada.prazoFornecedorDias as number) : base;
  return { prazoDiasUteis, prazoEm: adicionaDiasUteis(entrada.entrouEm, prazoDiasUteis) };
}

/**
 * Como o prazo da etapa aberta está agora. "Vence hoje" é seu próprio estado
 * porque é o único momento em que a renegociação ainda é possível — depois do
 * vencimento o POP §3 não admite renegociar, admite atraso.
 */
export function situacaoDoPrazo(prazoEm: Date | null, agora: Date): SituacaoPrazo {
  if (!prazoEm) {
    return "sem_prazo";
  }
  if (agora > prazoEm) {
    return "vencida";
  }
  return diaOrdinal(partesLocais(prazoEm)) === diaOrdinal(partesLocais(agora)) ? "vence_hoje" : "no_prazo";
}
