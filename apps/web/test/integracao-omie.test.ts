import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ConexaoOmieDaEmpresa, EstadoDasConexoesOmie } from "@plugga/shared";

import {
  acoesDaConexao,
  cnpjComMascara,
  cnpjDigitado,
  empresaDoTeste,
  empresasNoTeste,
  podeDefinirCnpj,
  resumoDoCartao,
  seloDoCartao,
  textoDoBloqueio,
} from "../app/lib/integracao-omie.ts";

const conexao = (parcial: Partial<ConexaoOmieDaEmpresa>): ConexaoOmieDaEmpresa => ({
  empresa: "plugga", situacao: "nao_conectada", bloqueio: null, mascara: null, cnpjDoCadastro: null, ultimoTeste: null, confirmada: null, atualizadoEm: null, atualizadoPor: null, ...parcial,
});
const estado = (plugga: Partial<ConexaoOmieDaEmpresa>, waze: Partial<ConexaoOmieDaEmpresa>, contaAntiga: EstadoDasConexoesOmie["contaAntiga"] = null): EstadoDasConexoesOmie => ({
  conexoes: [conexao({ empresa: "plugga", ...plugga }), conexao({ empresa: "waze", ...waze })], contaAntiga, cofreConfigurado: true,
});
const teste = (...cnpjs: (string | null)[]) => ({ em: "2026-11-23T14:00:00.000Z", por: "Gerente (sintético)", empresas: cnpjs.map((cnpj) => ({ razaoSocial: "Empresa Exemplo (sintético)", nomeFantasia: null, cnpj })) });

describe("cartão do OMIE", () => {
  it("o selo do cartão segue o pior estado entre as empresas", () => {
    assert.deepEqual(seloDoCartao(null), { tom: "neutral", texto: "Consultando" });
    assert.equal(seloDoCartao(estado({}, {})).texto, "Não conectado");
    assert.equal(seloDoCartao(estado({ situacao: "conectada" }, {})).texto, "Parcial");
    assert.equal(seloDoCartao(estado({ situacao: "conectada" }, { situacao: "a_confirmar" })).texto, "Falta conferir");
    assert.equal(seloDoCartao(estado({ situacao: "conectada" }, { situacao: "bloqueada" })).texto, "Requer atenção");
    assert.equal(seloDoCartao(estado({ situacao: "ilegivel" }, { situacao: "conectada" })).texto, "Requer atenção");
    assert.deepEqual(seloDoCartao(estado({ situacao: "conectada" }, { situacao: "conectada" })), { tom: "success", texto: "Conectado" });
  });

  it("o resumo diz o estado de cada empresa, e lembra a conta antiga quando nada foi conectado", () => {
    assert.equal(resumoDoCartao(estado({ situacao: "conectada" }, { situacao: "a_testar" })), "Plugga conectada · Waze Energia a testar");
    assert.equal(resumoDoCartao(estado({}, {})), "Nenhuma empresa conectada");
    assert.equal(resumoDoCartao(estado({}, {}, { mascara: "••••a1b2", atualizadoEm: "2026-11-01T00:00:00.000Z" })), "Conta antiga guardada: mova para a Plugga");
  });

  it("cada bloqueio vira uma frase que diz o que fazer", () => {
    assert.match(textoDoBloqueio("mais_de_uma_empresa", "waze"), /mais de uma empresa/);
    assert.match(textoDoBloqueio("mais_de_uma_empresa", "waze", 3), /devolveu 3 empresas/);
    assert.match(textoDoBloqueio("cnpj_de_outra_empresa", "waze"), /outra empresa/);
    assert.match(textoDoBloqueio("cnpj_diferente_do_cadastro", "waze"), /cadastro da Waze Energia/);
    assert.match(textoDoBloqueio("sem_cnpj", "plugga"), /não devolveu o CNPJ/);
  });

  it("os botões da linha seguem a situação: confirmar só com uma empresa no teste e CNPJ", () => {
    assert.deepEqual(acoesDaConexao(conexao({})), { conectar: true, testar: false, confirmar: false, desconectar: false });
    assert.deepEqual(acoesDaConexao(conexao({ situacao: "a_testar", mascara: "••••1234" })), { conectar: true, testar: true, confirmar: false, desconectar: true });
    assert.equal(acoesDaConexao(conexao({ situacao: "a_confirmar", mascara: "••••1234", ultimoTeste: teste("12345678000190") })).confirmar, true);
    assert.equal(acoesDaConexao(conexao({ situacao: "a_confirmar", mascara: "••••1234", ultimoTeste: teste(null) })).confirmar, false);
    // Ilegível: o cofre não abre; dá para desconectar e regravar, mas não testar.
    assert.deepEqual(acoesDaConexao(conexao({ situacao: "ilegivel" })), { conectar: true, testar: false, confirmar: false, desconectar: true });
  });

  it("o total do teste vem do campo total, ou da lista quando ele falta", () => {
    assert.equal(empresasNoTeste(conexao({ ultimoTeste: { ...teste("1", "2"), total: 5 } })), 5);
    assert.equal(empresasNoTeste(conexao({ ultimoTeste: teste("1", "2") })), 2);
    assert.equal(empresasNoTeste(conexao({})), 0);
  });

  it("a empresa do teste só vale quando o OMIE devolveu uma", () => {
    assert.equal(empresaDoTeste(conexao({ ultimoTeste: teste("12345678000190") }))?.cnpj, "12345678000190");
    assert.equal(empresaDoTeste(conexao({ ultimoTeste: teste("12345678000190", "98765432000110") })), null);
    assert.equal(empresaDoTeste(conexao({})), null);
  });

  it("CNPJ com máscara, digitado só com os dígitos, e só a plataforma define o do cadastro", () => {
    assert.equal(cnpjComMascara("12345678000190"), "12.345.678/0001-90");
    assert.equal(cnpjComMascara(null), "");
    assert.deepEqual(cnpjDigitado("12.345.678/0001-90"), { cnpj: "12345678000190" });
    assert.deepEqual(cnpjDigitado("  "), { cnpj: null });
    assert.equal(cnpjDigitado("123").erro, "informe os 14 dígitos do CNPJ.");
    assert.equal(podeDefinirCnpj({ plataforma: "admin" }), true);
    assert.equal(podeDefinirCnpj({ plataforma: null }), false);
  });
});
