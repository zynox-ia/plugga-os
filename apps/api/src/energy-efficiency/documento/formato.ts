/**
 * Formatação para o documento do cliente.
 *
 * Duas regras que vêm da persona e do checklist, e que já custaram retrabalho:
 *
 * - **Dinheiro nunca abrevia.** "R$ 8,3 mi" esconde centenas de milhares que
 *   mudam a decisão. Sempre `R$ 8.300.000,00`.
 * - **Nada de termo interno** no que o cliente lê. A lista está em
 *   `validacao.ts`, aplicada como trava sobre o HTML final.
 */

const MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function dinheiro(valor: number): string {
  // Intl usa espaço estreito não separável após "R$"; normalizado para espaço
  // comum porque o caractere original quebra buscas por "R$ " na validação.
  return MOEDA.format(valor).replace(/[\u00a0\u202f]/g, " ");
}

export function numero(valor: number, casas = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(valor);
}

export function percentual(valor: number, casas = 2): string {
  return `${numero(valor, casas)}%`;
}

/**
 * Tarifa em R$/kWh com seis casas — a precisão em que a distribuidora publica.
 * Arredondar para dois centavos aqui esconderia diferença relevante quando
 * multiplicada por centenas de milhares de kWh.
 */
export function tarifa(valor: number): string {
  return `R$ ${numero(valor, 6)}/kWh`;
}

/** Escapa texto vindo de dado do caso antes de entrar no HTML. */
export function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
