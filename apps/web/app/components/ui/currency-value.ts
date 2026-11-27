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

/** Teto padrão de algarismos da máscara (13 inteiros e 2 centavos); cada tela pode pedir o seu (`maxDigits`), conforme o contrato da API. */
export const MAX_CURRENCY_DIGITS = 15;

export type MaskedCurrency = { text: string; value: string };

const minus = /[-−]/g;

/** "1234" → "1.234": separador de milhar, sem tocar nos centavos. */
const withThousands = (whole: string) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Centavos corridos ("123456") → texto do campo e valor decimal ("1234.56"). `negative` só mexe no texto e no valor quando há algo além de zero. */
function fromDigits(digits: string, negative: boolean): MaskedCurrency {
  const padded = digits.padStart(3, "0");
  const whole = padded.slice(0, -2);
  const cents = padded.slice(-2);
  const isZero = /^0+$/.test(digits);
  return {
    text: `${negative ? "-" : ""}${withThousands(whole)},${cents}`,
    value: `${negative && !isZero ? "-" : ""}${whole}.${cents}`,
  };
}

/**
 * Máscara de app de banco: o que o campo mostra agora (`raw`, com a tecla já aplicada pelo navegador)
 * vira só algarismos, que entram pelos centavos. `previous` é o que o campo mostrava antes e só serve
 * para distinguir apagar de digitar zero. Letras e símbolos somem; o hífen alterna o sinal onde é permitido.
 */
export function maskCurrencyTyping(raw: string, previous: string, allowNegative = false, maxDigits = MAX_CURRENCY_DIGITS): MaskedCurrency {
  const negative = allowNegative && ((raw.match(minus)?.length ?? 0) % 2 === 1);
  const all = raw.replace(/\D/g, "");
  const digits = all.slice(0, maxDigits).replace(/^0+(?=\d)/, "");
  const erased = all.length < previous.replace(/\D/g, "").length;
  if (/^0*$/.test(digits) && (erased || all === "")) return { text: negative ? "-" : "", value: "" };
  return fromDigits(digits, negative);
}

/** Valor colado ("1.234,56", "1234,56", "1234.56", "R$ 1.234,56"): `undefined` quando não é valor em reais. */
export function parseCurrencyPaste(pasted: string, allowNegative = false, maxDigits = MAX_CURRENCY_DIGITS): MaskedCurrency | undefined {
  const text = pasted.trim().replace(/^R\$\s*/, "").replace(/^−/, "-");
  const negative = text.startsWith("-");
  if (negative && !allowNegative) return undefined;
  const parsed = parseCurrencyInput(negative ? text.slice(1) : text);
  if (!parsed) return undefined;
  const [whole = "0", cents = "00"] = parsed.split(".");
  if (whole.replace(/^0+(?=\d)/, "").length + 2 > maxDigits) return undefined;
  return fromDigits(`${whole}${cents}`.replace(/^0+(?=\d)/, ""), negative);
}

/**
 * Uma alteração do campo, lida pelo jeito que o texto entrou (`inputType` e `data` do evento de entrada).
 * Um algarismo digitado segue pelos centavos; um bloco de texto (colar, arrastar, autofill, sugestão do
 * navegador, `fill`) é lido como colar ("25000" é 25.000,00). `undefined`: o bloco não é valor em reais e o
 * campo fica como estava.
 */
export function maskCurrencyChange(raw: string, previous: string, input: { inputType?: string | null; data?: string | null }, options: { allowNegative?: boolean; maxDigits?: number } = {}): MaskedCurrency | undefined {
  const { allowNegative = false, maxDigits = MAX_CURRENCY_DIGITS } = options;
  const tipo = input.inputType || undefined; // "" vale como ausente
  const bloco = tipo === undefined ? !passoDeDigitacao(raw, previous)
    : replacementInputs.has(tipo) || (tipo.startsWith("insert") && (input.data?.length ?? 0) > 1);
  if (!bloco) return maskCurrencyTyping(raw, previous, allowNegative, maxDigits);
  return parseCurrencyPaste(input.data || raw, allowNegative, maxDigits);
}

/**
 * Sem metadados do evento, só é digitação o que acrescenta um caractere ao fim do texto, tira o último ou
 * esvazia o campo (com a máscara, o cursor fica no fim). Qualquer outra mudança, de qualquer tamanho, é
 * substituição em bloco, mesmo que os algarismos coincidam ("123,45" trocado por "12345").
 */
function passoDeDigitacao(raw: string, previous: string): boolean {
  return raw === "" || raw === previous || raw === previous.slice(0, -1) || (raw.length === previous.length + 1 && raw.startsWith(previous));
}

const replacementInputs = new Set(["insertFromPaste", "insertFromDrop", "insertReplacementText"]);

/** O valor decimal que vem de fora ("2640.00", "-200.00") como o campo o mostra. Um negativo aparece como veio, mesmo onde não é permitido (veja `signError`). Vazio ou inválido, vazio. */
export function currencyFieldText(value: string): string {
  const negative = value.startsWith("-");
  const shown = displayCurrency(negative ? value.slice(1) : value);
  return shown && negative ? `-${shown}` : shown;
}

/** O aviso quando o campo mostra um negativo que a tela não aceita (valor vindo de fora): ele não some em silêncio. */
export function signError(text: string, allowNegative: boolean): string | undefined {
  return !allowNegative && text.startsWith("-") ? "Este campo não aceita valor negativo." : undefined;
}
