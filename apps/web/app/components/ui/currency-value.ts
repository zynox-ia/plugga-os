export const CURRENCY_INPUT_PATTERN = String.raw`\s*(?:R\$\s*)?(?:(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{0,2})?|\d+\.\d{0,2})\s*`;
const currencyInput = new RegExp(`^${CURRENCY_INPUT_PATTERN}$`);

/** Decimal em texto, sem cálculos de ponto flutuante ou perda de centavos. */
export function parseCurrencyInput(input: string): string | undefined {
  if (!input.trim()) return "";
  if (!currencyInput.test(input)) return undefined;
  const text = input.trim().replace(/^R\$\s*/, "");
  const decimalPoint = /^\d+\.\d{0,2}$/.test(text);
  const [whole = "0", fraction = ""] = decimalPoint ? text.split(".") : text.replace(/\./g, "").split(",");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
}

export function displayCurrency(value: string): string {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return "";
  const [whole = "0", fraction = ""] = value.split(".");
  return `${BigInt(whole).toLocaleString("pt-BR")},${fraction.padEnd(2, "0")}`;
}
