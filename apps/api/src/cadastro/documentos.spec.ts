import { describe, expect, it } from "vitest";

import { cepValido, cnpjValido, somenteDigitos } from "./documentos";

describe("documentos", () => {
  it("tira a máscara e deixa só os dígitos", () => {
    expect(somenteDigitos("99.999.001/0001-59")).toBe("99999001000159");
    expect(somenteDigitos(" 69.000-000 ")).toBe("69000000");
  });

  it("aceita CNPJ com verificadores corretos, com ou sem máscara", () => {
    expect(cnpjValido("99999001000159")).toBe(true);
    expect(cnpjValido("99.999.001/0001-59")).toBe(true);
    expect(cnpjValido("99.999.000/0001-04")).toBe(true);
  });

  it("recusa CNPJ com verificador errado, tamanho errado ou sequência repetida", () => {
    expect(cnpjValido("99999001000158")).toBe(false);
    expect(cnpjValido("9999900100015")).toBe(false);
    expect(cnpjValido("999990010001591")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
    expect(cnpjValido("")).toBe(false);
  });

  it("CEP precisa de 8 dígitos e não pode ser zerado", () => {
    expect(cepValido("69000000")).toBe(true);
    expect(cepValido("69.000-000")).toBe(true);
    expect(cepValido("6900000")).toBe(false);
    expect(cepValido("690000000")).toBe(false);
    expect(cepValido("00000000")).toBe(false);
    expect(cepValido("abcdefgh")).toBe(false);
  });
});
