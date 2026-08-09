import type {
  FinancialResult,
  InvoiceContext,
  InvoiceData,
  SavingsResult,
  TrafficLightResult,
} from "@plugga/shared";

const semAcentos = (valor: string): string =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(s a|sa|ltda|eireli)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Nome canônico usado apenas na chave de governança. O nome original continua
 * no relatório. As duas abreviações sem UF refletem os layouts cobertos pelo
 * PRD v1: ENERGISA = Rondônia e AMBAR ENERGIA = Amazonas.
 */
export function normalizarDistribuidora(distribuidora: string): string {
  const nome = semAcentos(distribuidora);
  if (
    nome === "energisa" ||
    (nome.includes("energisa") &&
      (nome.includes("rondonia") || /\bro\b/.test(nome)))
  ) {
    return "energisa rondonia";
  }
  if (nome === "ambar energia" || (nome.includes("ambar energia") && nome.includes("amazonas"))) {
    return "ambar energia am";
  }
  if (nome.includes("roraima energia")) return "roraima energia";
  if (nome.includes("amazonas energia")) return "amazonas energia";
  return nome;
}

export function chaveDoTipo(contexto: InvoiceContext): string {
  return [
    normalizarDistribuidora(contexto.distribuidora),
    contexto.regime,
    contexto.modalidade,
    contexto.grupo,
  ]
    .map((valor) => valor.trim().toLocaleLowerCase("pt-BR"))
    .join("|");
}

/** Semáforo do PRD. Vermelho sempre prevalece sobre tipo conhecido. */
export function classificarSemaforo(entrada: {
  fatura: InvoiceData;
  contexto: InvoiceContext;
  economia: SavingsResult;
  financeiro: FinancialResult;
  tipoConhecido: boolean;
}): TrafficLightResult {
  const { fatura, contexto, economia, financeiro, tipoConhecido } = entrada;
  const motivos: string[] = [];
  const tir = financeiro.tir;
  const paybackAnos = financeiro.paybackProjetadoAnos;

  if (tir !== null && tir > 0.6) motivos.push(`TIR ${(tir * 100).toFixed(1)}% a.a. acima de 60%`);
  if (paybackAnos !== null && paybackAnos * 12 < 24) {
    motivos.push(`payback ${(paybackAnos * 12).toFixed(1)} meses abaixo de 24 meses`);
  }
  if (economia.economiaMensal > fatura.valorTotal * 0.5) {
    motivos.push("economia mensal acima de 50% da fatura");
  }
  if (fatura.tarifaForaPonta > 0 && fatura.tarifaPonta / fatura.tarifaForaPonta > 8) {
    motivos.push(
      `spread ${(fatura.tarifaPonta / fatura.tarifaForaPonta).toFixed(1)}× acima de 8×`,
    );
  }

  const faixa = motivos.length > 0 ? "vermelho" : tipoConhecido ? "verde" : "amarelo";
  if (faixa === "amarelo") motivos.push("primeira fatura desta combinação de tipo");

  return {
    faixa,
    chaveTipo: chaveDoTipo(contexto),
    tipoConhecido,
    motivos,
    quatroNumeros: {
      totalFatura: fatura.valorTotal,
      consumoPontaKwh: fatura.consumoPontaKwh,
      tirAnual: tir,
      paybackAnos,
    },
  };
}
