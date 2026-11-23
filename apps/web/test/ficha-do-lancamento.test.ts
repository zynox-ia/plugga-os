import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Lancamento } from "@plugga/shared";

import {
  camposDoLancamento,
  camposTravadosNaAprovada,
  categoriasDaSaida,
  contaAPagarVazia,
  corpoDaEdicao,
  corpoDaNovaContaAPagar,
  eventosDoLancamento,
  eventosPorDia,
  fraseDoOmie,
  pendenciasDoLancamento,
  resumoDaTrilhaDoLancamento,
  trilhaDoLancamento,
  valorEmDigitacao,
} from "../app/lib/ficha-do-lancamento.ts";

const u = (n: number) => `6f1c2a3b-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pessoa = { id: u(90), nome: "Gerente Exemplo (sintético)" };
const saida: Lancamento = {
  id: u(1), tipo: "saida", codigo: "CP-0002", empresa: "plugga", etapa: "aberta", coluna: "preparo", emCobranca: false, cancelado: false,
  favorecido: { tipo: "fornecedor", id: u(2), nome: "Contabilidade Exemplo (sintético)" },
  categoria: { id: u(3), codigo: "2.03.02", nome: "Honorários contábeis", tipo: "despesa", natureza: "servico" },
  contaCorrente: { id: u(4), nome: "Itaú · Plugga" }, descricao: "Honorários contábeis · nov/2026", valor: "3800.00", vencimento: "2026-11-28",
  competencia: null, prazo: { situacao: "no_prazo", dias: 5 }, liquidadoEm: null, anexos: 0, omie: { estado: "nao_enviado", codigo: null, motivo: null },
  origem: { tipo: "avulsa", pedidoDeCompra: null }, createdAt: "2026-11-23T12:00:00.000Z",
  forma: "boleto", observacao: null,
  marcos: { criado: { por: pessoa, em: "2026-11-23T12:00:00.000Z" }, aprovado: null, pago: null, recebido: null, conciliado: null, cancelado: null },
  acoesPermitidas: ["aprovar", "cancelar"], podeEditar: true, updatedAt: "2026-11-23T12:00:00.000Z",
};

describe("trilha da ficha", () => {
  it("marca as etapas do tipo até a atual, e a 390 px vira 'N de M'", () => {
    assert.deepEqual(trilhaDoLancamento({ ...saida, etapa: "aprovada" }).map((p) => p.estado), ["feito", "atual", "futuro", "futuro"]);
    assert.deepEqual(resumoDaTrilhaDoLancamento({ ...saida, etapa: "aprovada" }), { posicao: 2, total: 4, atual: "Aprovada", proxima: "Paga" });
    assert.equal(trilhaDoLancamento({ ...saida, tipo: "entrada", etapa: "enviada" }).length, 6);
  });

  it("no cancelado, a etapa onde parou fica marcada e não há próxima", () => {
    assert.deepEqual(trilhaDoLancamento({ ...saida, cancelado: true }).map((p) => p.estado), ["cancelado", "futuro", "futuro", "futuro"]);
    assert.deepEqual(resumoDaTrilhaDoLancamento({ ...saida, cancelado: true }), { posicao: 1, total: 4, atual: "Cancelada em Aberta", proxima: null });
  });
});

describe("o que falta", () => {
  it("na saída aberta: categoria feita, anexo opcional e a aprovação da Gerente", () => {
    assert.deepEqual(pendenciasDoLancamento(saida), [
      { texto: "Categoria do OMIE: Honorários contábeis", feito: true },
      { texto: "Boleto ou NF anexado", feito: false, opcional: true },
      { texto: "Aprovação da Gerente do Financeiro", feito: false },
    ]);
  });

  it("na aprovada, a conta no OMIE só conta como feita depois de enviada; cancelado e conciliado não pedem nada", () => {
    assert.equal(pendenciasDoLancamento({ ...saida, etapa: "aprovada" })[0]?.feito, false);
    assert.equal(pendenciasDoLancamento({ ...saida, etapa: "aprovada", omie: { estado: "enviado", codigo: "8812934", motivo: null } })[0]?.feito, true);
    assert.deepEqual(pendenciasDoLancamento({ ...saida, cancelado: true }), []);
    assert.deepEqual(pendenciasDoLancamento({ ...saida, etapa: "conciliada" }), []);
  });
});

describe("linha do tempo", () => {
  it("os marcos viram eventos do mais recente para o mais antigo, com o motivo do cancelamento", () => {
    const l = { ...saida, cancelado: true, marcos: { ...saida.marcos, cancelado: { por: pessoa, em: "2026-11-24T15:00:00.000Z", motivo: "Fatura duplicada" } } };
    const eventos = eventosDoLancamento(l);
    assert.deepEqual(eventos.map((e) => e.chave), ["cancelado", "criado"]);
    assert.equal(eventos[0]?.nota, "Fatura duplicada");
    assert.equal(eventos[0]?.texto, "cancelou na etapa Aberta");
  });

  it("agrupa por dia de Manaus, com Hoje e Ontem pelo nome", () => {
    const dias = eventosPorDia([
      { chave: "a", icone: "aprovado", em: "2026-11-24T15:00:00.000Z", quem: null, texto: "" },
      { chave: "b", icone: "criado", em: "2026-11-23T03:30:00.000Z", quem: null, texto: "" }, // 22/11 23:30 em Manaus
    ], "2026-11-24");
    assert.deepEqual(dias.map((d) => d.rotulo), ["Hoje", "22/11/2026"]);
    assert.equal(eventosPorDia([{ chave: "c", icone: "pago", em: "2026-11-23T15:00:00.000Z", quem: null, texto: "" }], "2026-11-24")[0]?.rotulo, "Ontem");
  });
});

describe("estado no OMIE", () => {
  it("diz para qual empresa vai, e só erro e divergência ganham o tom de perigo", () => {
    assert.deepEqual(fraseDoOmie(saida, "Plugga"), { texto: "Ainda não está no OMIE: vai para a Plugga quando for aprovada.", tom: "neutro" });
    assert.equal(fraseDoOmie({ ...saida, omie: { estado: "enviado", codigo: "8812934", motivo: null } }, "Waze Energia").texto, "No OMIE da Waze Energia · código 8812934.");
    assert.deepEqual(fraseDoOmie({ ...saida, omie: { estado: "erro", codigo: null, motivo: "A categoria não existe na Waze." } }, "Waze Energia"), { texto: "Não foi ao OMIE da Waze Energia: A categoria não existe na Waze.", tom: "perigo" });
    assert.equal(fraseDoOmie({ ...saida, omie: { estado: "divergente", codigo: "1", motivo: null } }, "Plugga").tom, "perigo");
  });
});

describe("nova conta a pagar e edição", () => {
  const preenchida = { ...contaAPagarVazia(), empresa: "plugga" as const, fornecedorId: u(2), categoriaId: u(3), contaCorrenteId: u(4), descricao: "  Honorários  ", valor: "1.234,56", vencimento: "2026-12-05", forma: "pix" as const };

  it("aponta cada campo que falta, com o nome do campo da API", () => {
    const { corpo, porCampo } = corpoDaNovaContaAPagar(contaAPagarVazia());
    assert.equal(corpo, undefined);
    assert.deepEqual(Object.keys(porCampo).sort(), ["categoriaId", "contaCorrenteId", "descricao", "empresa", "fornecedorId", "valor", "vencimento"]);
    assert.equal(porCampo.categoriaId, "escolha a empresa primeiro.");
  });

  it("monta o corpo com o valor em decimal e sem observação vazia; recusa o valor acima do teto", () => {
    assert.deepEqual(corpoDaNovaContaAPagar(preenchida).corpo, {
      empresa: "plugga", fornecedorId: u(2), categoriaId: u(3), contaCorrenteId: u(4), descricao: "Honorários", valor: "1234.56", vencimento: "2026-12-05", forma: "pix",
    });
    assert.ok(corpoDaNovaContaAPagar({ ...preenchida, valor: "1.000.000.000.000,00" }).porCampo.valor);
    assert.ok(corpoDaNovaContaAPagar({ ...preenchida, valor: "0" }).porCampo.valor);
  });

  it("o campo de valor guarda só dígitos, ponto e vírgula, na digitação e no colar", () => {
    assert.equal(valorEmDigitacao("abc1.234,56"), "1.234,56");
    assert.equal(valorEmDigitacao("R$ 27.350,00"), "27.350,00");
    assert.equal(valorEmDigitacao("-12e3"), "123");
    assert.equal(valorEmDigitacao(""), "");
  });

  it("a edição manda só o que mudou, sem empresa nem valor", () => {
    const antes = camposDoLancamento(saida);
    assert.equal(antes.valor, "3.800,00");
    assert.deepEqual(corpoDaEdicao(antes, antes).corpo, {});
    assert.deepEqual(corpoDaEdicao(antes, { ...antes, descricao: "Honorários de dez ", vencimento: "2026-12-10", valor: "9,99", empresa: "waze" }).corpo, { descricao: "Honorários de dez", vencimento: "2026-12-10" });
    assert.deepEqual(corpoDaEdicao(antes, { ...antes, observacao: "pagar cedo" }).corpo, { observacao: "pagar cedo" });
  });

  it("na saída aprovada, só a Gerente muda fornecedor, conta, forma e vencimento", () => {
    assert.equal(camposTravadosNaAprovada({ tipo: "saida", etapa: "aprovada" }, false), true);
    assert.equal(camposTravadosNaAprovada({ tipo: "saida", etapa: "aprovada" }, true), false);
    assert.equal(camposTravadosNaAprovada({ tipo: "saida", etapa: "aberta" }, false), false);
  });

  it("os menus mostram só as categorias de despesa ativas da empresa, mais a já escolhida se inativa", () => {
    const cat = (id: number, empresa: "plugga" | "waze", tipo: "despesa" | "receita", ativa: boolean, codigo: string) => ({ id: u(id), empresa, codigo, nome: codigo, tipo, natureza: "outros" as const, grupo: { codigo: codigo.slice(0, 4), nome: "G" }, ativa });
    const opcoes = { categorias: [cat(10, "plugga", "despesa", true, "2.10"), cat(11, "plugga", "despesa", true, "2.9"), cat(12, "plugga", "receita", true, "1.01"), cat(13, "waze", "despesa", true, "2.01"), cat(14, "plugga", "despesa", false, "2.05")] };
    assert.deepEqual(categoriasDaSaida(opcoes, "plugga").map((c) => c.codigo), ["2.9", "2.10"]);
    assert.deepEqual(categoriasDaSaida(opcoes, "plugga", u(14)).map((c) => c.codigo), ["2.05", "2.9", "2.10"]);
    assert.deepEqual(categoriasDaSaida(opcoes, null), []);
  });
});
