import { describe, expect, it } from "vitest";

import { cepValido, cnpjValido, somenteDigitos } from "./documentos";

describe("documentos", () => {
  it("tira a máscara e deixa só os dígitos", () => {
    expect(somenteDigitos("11.222.333/0001-81")).toBe("11222333000181");
    expect(somenteDigitos(" 69.000-000 ")).toBe("69000000");
  });

  it("aceita CNPJ com verificadores corretos, com ou sem máscara", () => {
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("00.000.000/0001-91")).toBe(true);
  });

  it("recusa CNPJ com verificador errado, tamanho errado ou sequência repetida", () => {
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("1122233300018")).toBe(false);
    expect(cnpjValido("112223330001811")).toBe(false);
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
