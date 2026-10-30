import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cnpjValido,
  cpfValido,
  formatarCep,
  formatarCnpj,
  formatarCpf,
  formatarTelefone,
  mascararCpf,
  mascararTelefone,
  somenteDigitos,
} from "../src/documento.ts";

// Documentos da faixa sintética do projeto (scripts/dados-sinteticos.mjs), com dígito verificador válido.
const CPF = "99999900100";
const CNPJ = "99999001000159";

describe("cpfValido", () => {
  it("aceita CPF com dígitos verificadores corretos, com ou sem pontuação", () => {
    assert.equal(cpfValido(CPF), true);
    assert.equal(cpfValido("999.999.001-00"), true);
  });

  it("recusa dígito verificador errado, tamanho errado e sequência repetida", () => {
    assert.equal(cpfValido("99999900101"), false);
    assert.equal(cpfValido("9999990010"), false);
    assert.equal(cpfValido("11111111111"), false);
  });
});

describe("cnpjValido", () => {
  it("aceita CNPJ com dígitos verificadores corretos, com ou sem pontuação", () => {
    assert.equal(cnpjValido(CNPJ), true);
    assert.equal(cnpjValido("99.999.001/0001-59"), true);
  });

  it("recusa dígito verificador errado, tamanho errado e sequência repetida", () => {
    assert.equal(cnpjValido("99999001000158"), false);
    assert.equal(cnpjValido("9999900100015"), false);
    assert.equal(cnpjValido("00000000000000"), false);
  });
});

describe("formatação", () => {
  it("formata CPF, CNPJ e CEP a partir dos dígitos", () => {
    assert.equal(formatarCpf(CPF), "999.999.001-00");
    assert.equal(formatarCnpj(CNPJ), "99.999.001/0001-59");
    assert.equal(formatarCep("69041010"), "69041-010");
  });

  it("formata celular, fixo e número com código do país", () => {
    assert.equal(formatarTelefone("92999994120"), "(92) 99999-4120");
    assert.equal(formatarTelefone("9230007700"), "(92) 3000-7700");
    assert.equal(formatarTelefone("5592999994120"), "(92) 99999-4120");
  });

  it("devolve o valor original quando não reconhece o formato", () => {
    assert.equal(formatarTelefone("12345"), "12345");
  });

  it("extrai só os dígitos", () => {
    assert.equal(somenteDigitos("(92) 9 9999-4120"), "92999994120");
  });
});

describe("máscaras para listas", () => {
  it("esconde o início e os dígitos verificadores do CPF", () => {
    assert.equal(mascararCpf(CPF), "•••.999.001-••");
  });

  it("mantém o DDD e os 4 últimos dígitos do telefone", () => {
    assert.equal(mascararTelefone("92999994120"), "(92) 9••••-4120");
    assert.equal(mascararTelefone("9230007700"), "(92) 3•••-7700");
  });

  it("mascara telefone fora do formato sem revelar o número inteiro", () => {
    assert.equal(mascararTelefone("12345"), "•2345");
  });
});
