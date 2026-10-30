import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { displayCurrency, parseCurrencyInput } from "../app/components/ui/currency-value.ts";

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
