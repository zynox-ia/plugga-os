import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { currencyFieldText, displayCurrency, maskCurrencyChange, maskCurrencyTyping, signError, MAX_CURRENCY_DIGITS, parseCurrencyInput, parseCurrencyPaste } from "../app/components/ui/currency-value.ts";

describe("entrada de valores em reais", () => {
  it("interpreta inteiros, centavos e valores colados sem mudar a escala", () => {
    for (const [input, expected] of [["25000", "25000.00"], ["1.234,56", "1234.56"], ["R$ 9.876,50", "9876.50"], ["12,3", "12.30"], ["12.30", "12.30"], ["0", "0.00"], ["", ""]] as const) {
      assert.equal(parseCurrencyInput(input), expected, input);
    }
  });
  it("rejeita valores negativos, texto inválido e frações maiores que centavos", () => {
    for (const input of ["-10", "abc", "1,234", "1.23.4", "1e6", "NaN"]) assert.equal(parseCurrencyInput(input), undefined, input);
  });
  it("formata valores persistidos sem arredondar ou perder centavos", () => {
    assert.equal(displayCurrency("25000"), "25.000,00");
    assert.equal(displayCurrency("0.01"), "0,01");
    assert.equal(displayCurrency("9007199254740993.42"), "9.007.199.254.740.993,42");
    assert.equal(displayCurrency(""), "");
  });
});

/** Digita um texto tecla a tecla, como o campo faz: cada tecla entra no fim do que já aparece. */
function digitar(teclas: string, permitirNegativo = false) {
  let texto = "";
  let valor = "";
  for (const tecla of teclas) {
    const r = maskCurrencyTyping(texto + tecla, texto, permitirNegativo);
    texto = r.text;
    valor = r.value;
  }
  return { texto, valor };
}
const apagar = (texto: string, permitirNegativo = false) => maskCurrencyTyping(texto.slice(0, -1), texto, permitirNegativo);

describe("máscara de moeda ao digitar", () => {
  it("cada algarismo entra pelos centavos, com milhar ao vivo", () => {
    assert.deepEqual(digitar("1"), { texto: "0,01", valor: "0.01" });
    assert.deepEqual(digitar("12"), { texto: "0,12", valor: "0.12" });
    assert.deepEqual(digitar("123"), { texto: "1,23", valor: "1.23" });
    assert.deepEqual(digitar("123456"), { texto: "1.234,56", valor: "1234.56" });
    assert.deepEqual(digitar("123456789"), { texto: "1.234.567,89", valor: "1234567.89" });
  });
  it("o zero sozinho vira 0,00 e zeros à esquerda não aparecem", () => {
    assert.deepEqual(digitar("0"), { texto: "0,00", valor: "0.00" });
    assert.deepEqual(digitar("000"), { texto: "0,00", valor: "0.00" });
    assert.deepEqual(digitar("0050"), { texto: "0,50", valor: "0.50" });
  });
  it("letras e outros caracteres são ignorados", () => {
    assert.deepEqual(digitar("a1b2c3"), { texto: "1,23", valor: "1.23" });
    assert.deepEqual(digitar("1e5"), { texto: "0,15", valor: "0.15" });
    assert.deepEqual(digitar("R$ #!@"), { texto: "", valor: "" });
    assert.deepEqual(digitar("abc"), { texto: "", valor: "" });
  });
  it("Backspace remove o último algarismo até esvaziar o campo", () => {
    let texto = digitar("123456").texto;
    for (const esperado of [["123,45", "123.45"], ["12,34", "12.34"], ["1,23", "1.23"], ["0,12", "0.12"], ["0,01", "0.01"], ["", ""]]) {
      const proximo = apagar(texto);
      assert.deepEqual(proximo, { text: esperado[0], value: esperado[1] });
      texto = proximo.text;
    }
  });
  it("apagar o zero sozinho também esvazia o campo", () => {
    assert.deepEqual(apagar("0,00"), { text: "", value: "" });
  });
  it("o campo vazio continua vazio, sem virar 0,00", () => {
    assert.deepEqual(maskCurrencyTyping("", "", false), { text: "", value: "" });
    assert.deepEqual(apagar(""), { text: "", value: "" });
  });
  it("limita a quantidade de algarismos", () => {
    const r = digitar("9".repeat(MAX_CURRENCY_DIGITS + 5));
    assert.equal(r.texto, "9.999.999.999.999,99");
    assert.equal(r.valor, "9999999999999.99");
  });
  it("milhares grandes recebem separador a cada três casas", () => {
    assert.equal(digitar("100000000").texto, "1.000.000,00");
    assert.equal(digitar("100000000000").texto, "1.000.000.000,00");
  });
  it("sem permissão, o hífen é ignorado", () => {
    assert.deepEqual(digitar("-12"), { texto: "0,12", valor: "0.12" });
    assert.deepEqual(digitar("-"), { texto: "", valor: "" });
  });
  it("com permissão, o hífen alterna o sinal", () => {
    assert.deepEqual(digitar("-12", true), { texto: "-0,12", valor: "-0.12" });
    assert.deepEqual(digitar("123456-", true), { texto: "-1.234,56", valor: "-1234.56" });
    assert.deepEqual(digitar("-123456-", true), { texto: "1.234,56", valor: "1234.56" });
    assert.deepEqual(digitar("-", true), { texto: "-", valor: "" });
    assert.deepEqual(digitar("−5", true), { texto: "-0,05", valor: "-0.05" });
  });
  it("negativo: apagar mantém o sinal até o último algarismo", () => {
    assert.equal(apagar("-12,34", true).text, "-1,23");
    assert.deepEqual(apagar("-0,01", true), { text: "-", value: "" });
  });
  it("não existe menos zero no valor emitido", () => {
    assert.deepEqual(digitar("-0", true), { texto: "-0,00", valor: "0.00" });
  });
});

describe("colar valores em reais", () => {
  it("aceita os quatro formatos e todos dão 1.234,56", () => {
    for (const colado of ["1.234,56", "1234,56", "1234.56", "R$ 1.234,56"]) {
      assert.deepEqual(parseCurrencyPaste(colado), { text: "1.234,56", value: "1234.56" }, colado);
    }
  });
  it("respeita a escala do que foi colado, sem tratar como centavos", () => {
    assert.deepEqual(parseCurrencyPaste("1234,5"), { text: "1.234,50", value: "1234.50" });
    assert.deepEqual(parseCurrencyPaste("25000"), { text: "25.000,00", value: "25000.00" });
    assert.deepEqual(parseCurrencyPaste("  R$ 9.876,50  "), { text: "9.876,50", value: "9876.50" });
  });
  it("texto que não é valor é ignorado", () => {
    for (const colado of ["abc", "1,234", "1.23.4", "1e6", "", "   "]) assert.equal(parseCurrencyPaste(colado), undefined, colado);
  });
  it("negativo só é aceito com permissão", () => {
    assert.equal(parseCurrencyPaste("-1.234,56"), undefined);
    assert.deepEqual(parseCurrencyPaste("-1.234,56", true), { text: "-1.234,56", value: "-1234.56" });
    assert.deepEqual(parseCurrencyPaste("R$ -200,00", true), { text: "-200,00", value: "-200.00" });
  });
  it("o que passa do limite de algarismos é recusado", () => {
    assert.equal(parseCurrencyPaste("99999999999999999,99"), undefined);
  });
});

describe("valor que vem de fora do campo", () => {
  it("aparece formatado, sem perder centavos", () => {
    assert.equal(currencyFieldText("2640.00"), "2.640,00");
    assert.equal(currencyFieldText("25000"), "25.000,00");
    assert.equal(currencyFieldText("0.01"), "0,01");
    assert.equal(currencyFieldText("9007199254740993.42"), "9.007.199.254.740.993,42");
    assert.equal(currencyFieldText(""), "");
  });
  it("negativo aparece como veio, com ou sem permissão: nunca some em silêncio", () => {
    assert.equal(currencyFieldText("-200.00"), "-200,00");
    assert.equal(currencyFieldText("-200.00"), "-200,00");
  });
  it("sem permissão, o negativo que veio de fora ganha um aviso; com permissão ou positivo, nenhum", () => {
    assert.equal(signError("-200,00", false), "Este campo não aceita valor negativo.");
    assert.equal(signError("-200,00", true), undefined);
    assert.equal(signError("200,00", false), undefined);
    assert.equal(signError("", false), undefined);
    assert.equal(signError("-", false), "Este campo não aceita valor negativo.");
  });
  it("valor inválido vira campo vazio", () => {
    assert.equal(currencyFieldText("abc"), "");
  });
});

/** O que o campo emite para cada tipo de evento de entrada, no mesmo passo do componente. */
const entrada = (raw: string, previous: string, inputType?: string, data?: string | null, opcoes = {}) => maskCurrencyChange(raw, previous, { ...(inputType ? { inputType } : {}), ...(data !== undefined ? { data } : {}) }, opcoes);

describe("o valor emitido depende de como o texto entrou", () => {
  it("digitar um algarismo por vez segue pelos centavos", () => {
    let texto = "";
    let valor = "";
    for (const tecla of "123456") { const r = entrada(texto + tecla, texto, "insertText", tecla)!; texto = r.text; valor = r.value; }
    assert.deepEqual({ texto, valor }, { texto: "1.234,56", valor: "1234.56" });
  });
  it("fill (o texto inteiro substituído de uma vez) é lido como colar: 25000 vira 25.000,00, não 250,00", () => {
    assert.deepEqual(entrada("25000", "", "insertText", "25000"), { text: "25.000,00", value: "25000.00" });
    assert.deepEqual(entrada("25000", "1,23", "insertText", "25000"), { text: "25.000,00", value: "25000.00" });
    assert.deepEqual(entrada("1.234,56", "", "insertText", "1.234,56"), { text: "1.234,56", value: "1234.56" });
    assert.deepEqual(entrada("1234.5", "", "insertText", "1234.5"), { text: "1.234,50", value: "1234.50" });
  });
  it("colar, arrastar texto e correção do navegador (autofill, sugestão) também são lidos como colar", () => {
    for (const tipo of ["insertFromPaste", "insertFromDrop", "insertReplacementText"]) {
      assert.deepEqual(entrada("1,0025000", "1,00", tipo, "25000"), { text: "25.000,00", value: "25000.00" }, tipo);
      assert.deepEqual(entrada("R$ 1.234,56", "", tipo, null), { text: "1.234,56", value: "1234.56" }, `${tipo} sem data`);
    }
  });
  it("sem tipo de evento (autofill antigo, evento sintético), mais de um caractere novo conta como bloco", () => {
    assert.deepEqual(entrada("25000", ""), { text: "25.000,00", value: "25000.00" });
    assert.deepEqual(entrada("1,235", "1,23"), { text: "12,35", value: "12.35" }, "um caractere novo é digitação");
  });
  it("sem tipo de evento, substituição em bloco de tamanho igual ou menor também é lida como colar, não como máscara", () => {
    assert.deepEqual(entrada("12345", "123,45"), { text: "12.345,00", value: "12345.00" }, "menor que o anterior, mesmos algarismos");
    assert.deepEqual(entrada("4,56", "1,23"), { text: "4,56", value: "4.56" }, "mesmo tamanho");
    assert.deepEqual(entrada("99", "1.234,56"), { text: "99,00", value: "99.00" }, "bem menor");
    assert.deepEqual(entrada("1234,56", "1.234,56"), { text: "1.234,56", value: "1234.56" }, "mesmos algarismos, outro formato");
  });
  it("sem tipo de evento, um caractere no fim e apagar o último seguem sendo digitação; esvaziar limpa", () => {
    assert.deepEqual(entrada("1.234,567", "1.234,56"), { text: "12.345,67", value: "12345.67" });
    assert.deepEqual(entrada("1.234,5", "1.234,56"), { text: "123,45", value: "123.45" });
    assert.deepEqual(entrada("1,23a", "1,23"), { text: "1,23", value: "1.23" }, "letra no fim não muda nada");
    assert.deepEqual(entrada("", "1,23"), { text: "", value: "" });
    assert.deepEqual(entrada("1,23", "1,23"), { text: "1,23", value: "1.23" });
  });
  it("tipo de evento vazio (\"\") vale como ausente: o mesmo fallback do tipo omitido", () => {
    for (const inputType of ["", null, undefined]) {
      assert.deepEqual(maskCurrencyChange("12345", "123,45", { inputType }), { text: "12.345,00", value: "12345.00" }, String(inputType));
      assert.deepEqual(maskCurrencyChange("1.234,567", "1.234,56", { inputType }), { text: "12.345,67", value: "12345.67" }, `digitação com ${String(inputType)}`);
    }
  });
  it("bloco que não é valor é ignorado (o campo fica como estava)", () => {
    assert.equal(entrada("abc", "1,23", "insertText", "abc"), undefined);
    assert.equal(entrada("1,23abc", "1,23", "insertFromDrop", "abc"), undefined);
    assert.equal(entrada("1e6", "", "insertText", "1e6"), undefined);
  });
  it("apagar e digitar sobre a seleção inteira continuam sendo digitação", () => {
    assert.deepEqual(entrada("", "1.234,56", "deleteContentBackward"), { text: "", value: "" });
    assert.deepEqual(entrada("123,45", "1.234,56", "deleteContentBackward"), { text: "123,45", value: "123.45" });
    assert.deepEqual(entrada("5", "1.234,56", "insertText", "5"), { text: "0,05", value: "0.05" });
  });
  it("bloco negativo só com permissão", () => {
    assert.equal(entrada("-200", "", "insertText", "-200"), undefined);
    assert.deepEqual(entrada("-200", "", "insertText", "-200", { allowNegative: true }), { text: "-200,00", value: "-200.00" });
  });
});

describe("teto de algarismos configurável", () => {
  it("ao digitar, passa do teto é ignorado; o padrão continua sendo o atual", () => {
    assert.equal(maskCurrencyTyping("99999999999999999", "", false, 14).text, "999.999.999.999,99");
    assert.equal(maskCurrencyTyping("99999999999999999", "", false).text, "9.999.999.999.999,99");
  });
  it("ao colar, o que passa do teto é recusado (o CRM aceita 12 inteiros e 2 centavos)", () => {
    assert.deepEqual(parseCurrencyPaste("999999999999,99", false, 14), { text: "999.999.999.999,99", value: "999999999999.99" });
    assert.equal(parseCurrencyPaste("9999999999999,99", false, 14), undefined);
    assert.deepEqual(parseCurrencyPaste("9999999999999,99"), { text: "9.999.999.999.999,99", value: "9999999999999.99" });
  });
  it("fill e colar respeitam o teto", () => {
    assert.equal(entrada("9999999999999", "", "insertText", "9999999999999", { maxDigits: 14 }), undefined);
    assert.deepEqual(entrada("999999999999", "", "insertText", "999999999999", { maxDigits: 14 }), { text: "999.999.999.999,00", value: "999999999999.00" });
  });
});
