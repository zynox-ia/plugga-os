import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  consultaDeMovimentacoes,
  deltaDaMovimentacao,
  horaEmManaus,
  hrefDeEstoque,
  lerFiltrosDeEstoque,
  nivelDoItem,
  numeroDigitado,
  paraContrato,
  previaDaMovimentacao,
  qtd,
  qtdComSinal,
  qtdOuTraco,
  rotuloDoDia,
  temFiltro,
  tomDoDisponivel,
} from "../app/lib/estoque.ts";
import { podeAbrirPagina } from "../app/lib/acesso-paginas.ts";
import { navGroupsForAccess, navIdForPathname, tituloForNavId } from "../app/lib/navigation.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const item = { id: ID, codigo: "MO-0007", nome: "Trilho", unidade: "un", empresa: "waze" as const };

describe("Estoque: filtros no endereço (PLU-333)", () => {
  it("lê a visão e os filtros, e ignora o que não conhece", () => {
    const f = lerFiltrosDeEstoque({ visao: "movimentacoes", empresa: "waze", tipo: "saida", item_mov: ID, periodo: "7", saldo: "zerado" });
    assert.deepEqual(f, { visao: "movimentacoes", busca: undefined, empresa: "waze", saldo: "zerado", tipo: "saida", itemId: ID, periodo: "7" });
    assert.deepEqual(lerFiltrosDeEstoque({ visao: "x", empresa: "outra", item_mov: "nao-e-uuid", periodo: "90" }), { visao: "cards", busca: undefined, periodo: "30" });
  });

  it("monta o link só com os filtros da visão atual", () => {
    assert.equal(hrefDeEstoque({ visao: "cards", periodo: "30" }), "/suprimentos/estoque");
    assert.equal(hrefDeEstoque({ visao: "lista", empresa: "plugga", categoria: "escritorio", saldo: "com_reserva", tipo: "entrada" }), "/suprimentos/estoque?visao=lista&empresa=plugga&categoria=escritorio&saldo=com_reserva");
    assert.equal(hrefDeEstoque({ visao: "movimentacoes", tipo: "ajuste", itemId: ID, periodo: "mes", categoria: "outros" }), `/suprimentos/estoque?visao=movimentacoes&tipo=ajuste&item_mov=${ID}&periodo=mes`);
    assert.equal(hrefDeEstoque({ visao: "cards" }, ID), `/suprimentos/estoque?item=${ID}`);
  });

  it("o período padrão (30 dias) não conta como filtro", () => {
    assert.equal(temFiltro(lerFiltrosDeEstoque({ visao: "movimentacoes" })), false);
    assert.equal(temFiltro(lerFiltrosDeEstoque({ visao: "movimentacoes", periodo: "7" })), true);
    assert.equal(temFiltro(lerFiltrosDeEstoque({ categoria: "kit_solar" })), true);
    assert.deepEqual(consultaDeMovimentacoes(lerFiltrosDeEstoque({ visao: "movimentacoes" })), { empresa: undefined, tipo: undefined, itemId: undefined, busca: undefined, periodo: "30" });
  });
});

describe("Estoque: números", () => {
  it("quantidade com unidade e até 3 casas", () => {
    assert.equal(qtd("36.000", "un"), "36 un");
    assert.equal(qtd("1234.5", "m"), "1.234,5 m");
    assert.equal(qtdOuTraco("0.000", "un"), "—");
  });

  it("quantidade com sinal: entrada soma, saída tira, ajuste com sinal, reserva sem sinal", () => {
    assert.equal(qtdComSinal({ tipo: "entrada", quantidade: "40", item }), "+40 un");
    assert.equal(qtdComSinal({ tipo: "saida", quantidade: "120", item }), "−120 un");
    assert.equal(qtdComSinal({ tipo: "ajuste", quantidade: "-1", item }), "−1 un");
    assert.equal(qtdComSinal({ tipo: "reserva", quantidade: "80", item }), "80 un");
    assert.equal(deltaDaMovimentacao({ tipo: "reserva", quantidade: "80" }), 0);
  });

  it("lê número digitado em pt-BR", () => {
    assert.equal(numeroDigitado("1.234,56", 2), 1234.56);
    assert.equal(numeroDigitado("1.234,5"), 1234.5);
    assert.equal(numeroDigitado("12,345"), 12.345);
    assert.equal(numeroDigitado("12,3456"), null);
    assert.equal(numeroDigitado("R$ 9,50", 2), 9.5);
    assert.equal(numeroDigitado("abc"), null);
    assert.equal(numeroDigitado(""), null);
    assert.equal(paraContrato(1234.56, 2), "1234.56");
    assert.equal(paraContrato(0.1 + 0.2, 3), "0.3");
  });

  it("tom do disponível no menu de itens", () => {
    assert.equal(tomDoDisponivel({ disponivel: "24", situacao: "normal" }), "ok");
    assert.equal(tomDoDisponivel({ disponivel: "3", situacao: "abaixo_do_minimo" }), "baixo");
    assert.equal(tomDoDisponivel({ disponivel: "0", situacao: "zerado" }), "zero");
  });

  it("barra de nível: saldo, reservado hachurado e traço do mínimo", () => {
    assert.deepEqual(nivelDoItem(36, 12, 20), { saldo: 90, reservaInicio: 60, reserva: 30, minimo: 50 });
    assert.deepEqual(nivelDoItem(0, 0, 0), { saldo: 0, reservaInicio: 0, reserva: 0, minimo: null });
    assert.equal(nivelDoItem(500, 0, 10).saldo, 100);
  });
});

describe("Estoque: prévia de Hoje → Depois", () => {
  const saldo = { emEstoque: "36", reservado: "12", disponivel: "24" };
  it("entrada soma; saída avisa quando passa do disponível", () => {
    assert.deepEqual(previaDaMovimentacao("entrada", saldo, 20, 10, null), { hoje: 36, depois: 46, disponivelDepois: 34, situacao: "normal", excedeDisponivel: false, abaixoDoReservado: false });
    const saida = previaDaMovimentacao("saida", saldo, 20, 30, null);
    assert.equal(saida.excedeDisponivel, true);
    assert.equal(saida.depois, 6);
    assert.equal(saida.situacao, "zerado");
  });
  it("ajuste vira o saldo contado e não pode ficar abaixo do reservado", () => {
    assert.equal(previaDaMovimentacao("ajuste", saldo, 20, null, 30).situacao, "abaixo_do_minimo");
    assert.equal(previaDaMovimentacao("ajuste", saldo, 20, null, 10).abaixoDoReservado, true);
    assert.equal(previaDaMovimentacao("ajuste", saldo, 20, null, null).depois, 36);
  });
});

describe("Estoque: datas", () => {
  it("rótulo do dia na lista de movimentações", () => {
    assert.equal(rotuloDoDia("2026-11-23", "2026-11-23"), "Hoje");
    assert.equal(rotuloDoDia("2026-11-22", "2026-11-23"), "Ontem");
    assert.equal(rotuloDoDia("2026-11-21", "2026-11-23"), "21 de novembro · sábado");
  });
  it("hora em Manaus", () => {
    assert.equal(horaEmManaus("2026-11-23T17:35:00.000Z"), "13:35");
    assert.equal(horaEmManaus("2026-11-24T02:10:00.000Z"), "22:10");
  });
});

describe("Estoque: rota e menu (PLU-333)", () => {
  it("abre só com a tela suprimentos.estoque", () => {
    const com = (telas: Array<"suprimentos.estoque" | "suprimentos.compras">) => ({ plataforma: null, departamentos: [{ departamento: "suprimentos" as const, nivel: "membro" as const, telas }] });
    assert.equal(podeAbrirPagina(com(["suprimentos.estoque"]), "/suprimentos/estoque"), true);
    assert.equal(podeAbrirPagina(com(["suprimentos.compras"]), "/suprimentos/estoque"), false);
  });

  it("sai do em-breve na barra lateral", () => {
    const suprimentos = navGroupsForAccess({ plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro" }] }).find((g) => g.label === "Suprimentos");
    assert.ok(suprimentos?.items.some((i) => i.id === "/suprimentos/estoque" && !i.disabled));
    assert.equal(navIdForPathname("/suprimentos/estoque"), "/suprimentos/estoque");
    assert.equal(tituloForNavId("/suprimentos/estoque"), "Estoque");
  });
});
