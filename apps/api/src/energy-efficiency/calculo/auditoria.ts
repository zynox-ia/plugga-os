import type { AuditResult, InvoiceData, ReactiveDiagnosis } from "@plugga/shared";

/**
 * Auditoria da fatura — a primeira etapa do estudo, antes de qualquer
 * oportunidade. Funções puras: a mesma entrada sempre dá o mesmo resultado, sem
 * banco, sem relógio e sem I/O, para poderem ser conferidas contra os casos já
 * aprovados (ver auditoria.spec.ts).
 *
 * Regra de linguagem que vem da persona: o termo "all-in" é proibido no
 * documento do cliente. O que aqui se chama `custoMedioTotal` aparece para o
 * cliente como "custo médio total da fatura".
 */

/** Divisão que devolve 0 em vez de Infinity/NaN quando não há base. */
function porBase(valor: number, base: number): number {
  return base > 0 ? valor / base : 0;
}

/**
 * Faixas definidas em references/metodologia-calculos.md. O corte é sobre o
 * peso do reativo na fatura, não sobre o valor absoluto: R$ 4 mil pesa muito
 * numa fatura de R$ 60 mil e quase nada numa de R$ 300 mil.
 */
export function diagnosticarReativo(percentual: number): ReactiveDiagnosis {
  if (percentual > 4) return "investigar";
  if (percentual >= 2) return "atencao";
  return "registrar";
}

export function auditarFatura(fatura: InvoiceData): AuditResult {
  const consumoTotalKwh = fatura.consumoPontaKwh + fatura.consumoForaPontaKwh;

  // O custo médio *efetivo* soma demanda à energia: é quanto custa de fato usar
  // energia. O custo médio *total* divide a fatura inteira, incluindo reativo,
  // bandeira e encargos. Os dois juntos mostram ao cliente quanto custa consumir
  // e quanto custa a conta fechada — separação pedida no piloto Serra Verde.
  const custoMedioEfetivo = porBase(
    fatura.valorPonta + fatura.valorForaPonta + fatura.valorDemanda,
    consumoTotalKwh,
  );

  const reativoPercentual = porBase(fatura.valorReativo, fatura.valorTotal) * 100;

  return {
    consumoTotalKwh,
    custoKwhPonta: porBase(fatura.valorPonta, fatura.consumoPontaKwh),
    custoKwhForaPonta: porBase(fatura.valorForaPonta, fatura.consumoForaPontaKwh),
    custoMedioTotal: porBase(fatura.valorTotal, consumoTotalKwh),
    custoMedioEfetivo,
    // O spread ponta/fora ponta é o que torna o deslocamento de energia
    // economicamente interessante — é o número que sustenta a oportunidade BESS.
    spread: fatura.tarifaPonta - fatura.tarifaForaPonta,
    reativoPercentual,
    reativoDiagnostico: diagnosticarReativo(reativoPercentual),
    beneficioFiscalPercentual: porBase(fatura.valorBeneficioFiscal, fatura.valorTotal) * 100,
  };
}
