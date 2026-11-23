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
  resultadoDaAcao,
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

describe("aviso geral depois de cada ação, lido do cartão que a API devolve", () => {
  const confirmadaPlugga = { situacao: "conectada" as const, mascara: "••••1234", confirmada: { em: "2026-11-23T14:00:00.000Z", por: "Gerente (sintético)", cnpj: "12345678000190", razaoSocial: "Plugga Exemplo (sintético)" } };

  it("trocar a chave da Waze pela já confirmada na Plugga e testar: erro com a explicação, nunca 'Teste feito.'", () => {
    // Trocar a chave grava o par e volta para "a testar".
    const depoisDeTrocar = estado(confirmadaPlugga, { situacao: "a_testar", mascara: "••••1234" });
    assert.deepEqual(resultadoDaAcao("gravar", "waze", depoisDeTrocar), { tom: "sucesso", texto: "Chave da Waze Energia guardada. Use “Testar” para conferir de qual empresa ela é." });
    // O teste devolve o CNPJ já confirmado na Plugga: a Waze fica bloqueada.
    const depoisDeTestar = estado(confirmadaPlugga, { situacao: "bloqueada", bloqueio: "cnpj_de_outra_empresa", mascara: "••••1234", ultimoTeste: teste("12345678000190") });
    const r = resultadoDaAcao("testar", "waze", depoisDeTestar);
    assert.equal(r.tom, "erro");
    assert.match(r.texto, /^Conexão da Waze Energia bloqueada\. Esta chave é da outra empresa/);
  });

  it("testar: conectada e a confirmar saem em sucesso; sem situação conhecida, 'Teste feito.'", () => {
    assert.deepEqual(resultadoDaAcao("testar", "plugga", estado(confirmadaPlugga, {})), { tom: "sucesso", texto: "Plugga conectada: o CNPJ confere com o cadastro." });
    assert.match(resultadoDaAcao("testar", "waze", estado({}, { situacao: "a_confirmar", mascara: "••••9", ultimoTeste: teste("98765432000110") })).texto, /Confira se é mesmo a Waze Energia/);
    assert.deepEqual(resultadoDaAcao("testar", "waze", null), { tom: "sucesso", texto: "Teste feito." });
  });

  it("qualquer ação que deixe a empresa bloqueada ou ilegível sai em erro (confirmar, mover a conta antiga)", () => {
    const bloqueadaPlugga = estado({ situacao: "bloqueada", bloqueio: "mais_de_uma_empresa", ultimoTeste: { ...teste("1", "2"), total: 3 } }, {}, { mascara: "••••a1b2", atualizadoEm: "2026-11-01T00:00:00.000Z" });
    const mover = resultadoDaAcao("mover", "plugga", bloqueadaPlugga);
    assert.equal(mover.tom, "erro");
    assert.match(mover.texto, /devolveu 3 empresas.*A conta antiga continua guardada\.$/);
    assert.equal(resultadoDaAcao("confirmar", "plugga", bloqueadaPlugga).tom, "erro");
    assert.equal(resultadoDaAcao("testar", "waze", estado({}, { situacao: "ilegivel" })).tom, "erro");
  });

  it("gravar na Waze o CNPJ com que a Plugga foi confirmada bloqueia a Plugga: o aviso sai em erro, falando dela", () => {
    const depois = estado({ situacao: "bloqueada", bloqueio: "cnpj_diferente_do_cadastro", mascara: "••••1234" }, { cnpjDoCadastro: "12345678000190" });
    const r = resultadoDaAcao("cnpj", "waze", depois);
    assert.equal(r.tom, "erro");
    assert.match(r.texto, /^CNPJ da Waze Energia gravado\. A conexão da Plugga ficou bloqueada: O CNPJ que o OMIE devolveu não é o do cadastro da Plugga/);
    assert.equal(resultadoDaAcao("cnpj_removido", "waze", depois).tom, "erro");
  });

  it("desconectar, CNPJ e mover que conecta saem em sucesso", () => {
    assert.equal(resultadoDaAcao("desconectar", "waze", estado({}, {})).texto, "OMIE da Waze Energia desconectado.");
    assert.equal(resultadoDaAcao("cnpj", "plugga", estado({}, {})).texto, "CNPJ da Plugga gravado. Teste a chave de novo para conferir.");
    assert.equal(resultadoDaAcao("cnpj_removido", "plugga", estado({}, {})).texto, "CNPJ da Plugga removido do cadastro.");
    assert.equal(resultadoDaAcao("mover", "plugga", estado(confirmadaPlugga, {})).texto, "A conta antiga virou a chave da Plugga, conferida pelo CNPJ.");
  });
});
