import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  consultaDaApi,
  decimalDigitado,
  diaCurto,
  hojeEmManaus,
  hrefDeCompras,
  intervaloDoPeriodo,
  lerFiltrosDeCompras,
  numeroDoPedido,
  pendenciasDaEtapa,
  problemaDoPrazo,
  quantidadeDigitada,
  quantidadeLegivel,
  textoDoDestino,
  temFiltroSoDaLista,
  textoDoPrazo,
  urlDoArquivo,
  valorCurto,
  valorEmReais,
} from "../app/lib/compras.ts";

const ID = "f57988c2-7a0d-4572-88ed-cc84bd69af8c";

describe("filtros de compras no endereço", () => {
  it("lê só valores conhecidos e cai no padrão", () => {
    assert.deepEqual(lerFiltrosDeCompras({}), { visao: "quadro", busca: undefined, cancelados: false, situacao: "em_andamento" });
    assert.deepEqual(
      lerFiltrosDeCompras({ visao: "lista", empresa: "waze", responsavel: ID, destino: "obra", periodo: "mes", situacao: "cancelado", busca: " kit " }),
      { visao: "lista", busca: "kit", empresa: "waze", responsavel: ID, destino: "obra", periodo: "mes", cancelados: false, situacao: "cancelado" },
    );
    const lixo = lerFiltrosDeCompras({ empresa: "outra", responsavel: "abc", destino: "lua", periodo: "ano", situacao: "x", cancelados: "sim" });
    assert.deepEqual(lixo, { visao: "quadro", busca: undefined, cancelados: false, situacao: "em_andamento" });
  });

  it("monta o link sem os padrões e com a ficha", () => {
    assert.equal(hrefDeCompras({ visao: "quadro", cancelados: false, situacao: "em_andamento" }), "/suprimentos/compras");
    assert.equal(hrefDeCompras({ visao: "quadro", empresa: "waze", cancelados: true }, ID), `/suprimentos/compras?empresa=waze&cancelados=1&pedido=${ID}`);
    assert.equal(hrefDeCompras({ visao: "lista", situacao: "todos", cancelados: true }), "/suprimentos/compras?visao=lista&situacao=todos");
  });
});

describe("período em dias de Manaus", () => {
  it("o dia de Manaus vira só depois das 4h UTC", () => {
    assert.equal(hojeEmManaus(new Date("2026-11-24T03:30:00Z")), "2026-11-23");
    assert.equal(hojeEmManaus(new Date("2026-11-24T04:00:00Z")), "2026-11-24");
  });

  it("traduz o período em de/ate inclusivos", () => {
    assert.deepEqual(intervaloDoPeriodo("7d", "2026-11-23"), { de: "2026-11-17", ate: "2026-11-23" });
    assert.deepEqual(intervaloDoPeriodo("mes", "2026-11-23"), { de: "2026-11-01", ate: "2026-11-23" });
    assert.deepEqual(intervaloDoPeriodo("mes-anterior", "2026-01-10"), { de: "2025-12-01", ate: "2025-12-31" });
    assert.deepEqual(intervaloDoPeriodo(undefined, "2026-11-23"), {});
  });

  it("a consulta da API leva responsavelId e o período, na lista", () => {
    const f = lerFiltrosDeCompras({ visao: "lista", empresa: "plugga", responsavel: ID, periodo: "7d" });
    assert.deepEqual(consultaDaApi(f, "2026-11-23"), { empresa: "plugga", responsavelId: ID, destino: undefined, de: "2026-11-17", ate: "2026-11-23" });
  });

  it("o quadro não filtra por responsável nem período, nem escondido (pedido do André)", () => {
    const parametros = { empresa: "plugga", responsavel: ID, periodo: "7d" };
    assert.equal(temFiltroSoDaLista(parametros), true);
    assert.equal(temFiltroSoDaLista({ ...parametros, visao: "lista" }), false);
    assert.equal(temFiltroSoDaLista({ empresa: "plugga" }), false);
    const f = lerFiltrosDeCompras(parametros);
    assert.deepEqual(consultaDaApi(f, "2026-11-23"), { empresa: "plugga", responsavelId: undefined, destino: undefined });
    // Da lista para o quadro, o link já sai sem os dois filtros.
    const daLista = lerFiltrosDeCompras({ ...parametros, visao: "lista" });
    assert.equal(hrefDeCompras({ ...daLista, visao: "quadro" }), "/suprimentos/compras?empresa=plugga");
  });
});

describe("valores e quantidades", () => {
  it("formata decimal em texto como reais", () => {
    assert.equal(valorEmReais("1450.00")?.replace(/\s/g, " "), "R$ 1.450,00");
    assert.equal(valorEmReais(null), null);
    assert.equal(valorCurto("68500"), "R$ 68,5 mil");
    assert.equal(valorCurto("1250000"), "R$ 1,25 mi");
    assert.equal(valorCurto("0.00"), "R$ 0");
  });

  it("lê o que a pessoa digita", () => {
    assert.equal(decimalDigitado("1.450,5"), "1450.50");
    assert.equal(decimalDigitado("R$ 39.370,00"), "39370.00");
    assert.equal(decimalDigitado("320"), "320.00");
    assert.equal(decimalDigitado("abc"), null);
    assert.equal(decimalDigitado(""), null);
    assert.equal(quantidadeDigitada("2,5"), "2.5");
    assert.equal(quantidadeDigitada("1.234,56"), "1234.56");
    assert.equal(quantidadeDigitada("1.234,5678"), null);
    assert.equal(quantidadeDigitada("0"), null);
    assert.equal(quantidadeDigitada("1.2345"), null);
    assert.equal(quantidadeLegivel("100", "m"), "100 m");
    assert.equal(quantidadeLegivel("2.5", null), "2,5");
  });
});

describe("textos do card", () => {
  it("número, destino e dia curto", () => {
    assert.equal(numeroDoPedido(1), "PC-0001");
    assert.equal(numeroDoPedido(131), "PC-0131");
    assert.equal(diaCurto("2026-12-04"), "4 dez");
    assert.equal(textoDoDestino({ tipo: "obra", obra: { id: ID, nome: "Residencial Ponta Negra" }, cliente: null }), "Obra · Residencial Ponta Negra");
    assert.equal(textoDoDestino({ tipo: "interno", obra: null, cliente: null }), "Interno");
  });

  it("selo do prazo da etapa", () => {
    const prazo = "2026-11-26T03:59:59.999Z";
    assert.equal(textoDoPrazo({ situacao: "em_andamento", situacaoDoPrazo: "no_prazo", prazoDaEtapaEm: prazo }), "No prazo · até 25 nov");
    assert.equal(textoDoPrazo({ situacao: "em_andamento", situacaoDoPrazo: "vence_hoje", prazoDaEtapaEm: prazo }), "Vence hoje");
    assert.equal(textoDoPrazo({ situacao: "em_andamento", situacaoDoPrazo: "vencido", prazoDaEtapaEm: prazo }), "Vencido · era 25 nov");
    assert.equal(textoDoPrazo({ situacao: "concluido", situacaoDoPrazo: null, prazoDaEtapaEm: null }), "Concluído");
    assert.equal(textoDoPrazo({ situacao: "cancelado", situacaoDoPrazo: null, prazoDaEtapaEm: null }), "Cancelado");
  });

  it("arquivo abre pela rota da web", () => {
    assert.equal(urlDoArquivo("/suprimentos/compras/pedidos/x/comprovante"), "/api/suprimentos/compras/pedidos/x/comprovante");
    assert.equal(urlDoArquivo("/api/x"), "/api/x");
  });
});

describe("o que falta para avançar", () => {
  const base = { situacao: "em_andamento" as const, itens: [{ id: ID, descricao: "Cabo", quantidade: "10", unidade: "m", itemDeEstoque: null }], destino: { tipo: "interno" as const, obra: null, cliente: null }, responsavel: null, cotacoes: [], cotacaoSelecionadaId: null, pagamento: null, comprovantePendente: null, origemAtendimento: null };
  const cotacao = (id: string) => ({ id, fornecedor: { id: ID, nome: "Solar Teste", ativo: true }, valor: "100.00", valorFrete: null, valorTotal: "100.00", prazoEntregaDias: 5, condicoesPagamento: null, arquivo: { nome: "c.pdf", tamanhoBytes: 10, tipo: "application/pdf", url: "/x" }, selecionada: false, criada: { por: null, em: "2026-11-23T12:00:00Z" } });

  it("cotações: falta a vencedora; 3 cotações é só recomendação", () => {
    const p = pendenciasDaEtapa({ ...base, etapa: "cotacoes", cotacoes: [cotacao(ID)] });
    assert.deepEqual(p.map((x) => [x.feito, x.texto, Boolean(x.opcional)]), [[true, "1 cotação com anexo", false], [false, "Escolher a vencedora", false], [false, "3 cotações para comparar (recomendado)", true]]);
    const escolhida = pendenciasDaEtapa({ ...base, etapa: "cotacoes", cotacoes: [cotacao(ID)], cotacaoSelecionadaId: ID });
    assert.equal(escolhida[1]?.texto, "Vencedora: Solar Teste");
  });

  it("retirada pede valor faturado só na aquisição; encerrado não tem pendência", () => {
    assert.equal(pendenciasDaEtapa({ ...base, etapa: "retirada", origemAtendimento: "aquisicao" }).length, 2);
    assert.equal(pendenciasDaEtapa({ ...base, etapa: "retirada", origemAtendimento: "estoque" }).length, 1);
    assert.deepEqual(pendenciasDaEtapa({ ...base, etapa: "concluido", situacao: "concluido" }), []);
  });
});

describe("prazo de entrega escolhido", () => {
  it("pede a data vazia e recusa a passada, menos a já gravada na edição", () => {
    assert.equal(problemaDoPrazo("", "2026-11-23"), "informe a data de entrega desejada.");
    assert.equal(problemaDoPrazo("2026-11-22", "2026-11-23"), "a data já passou; escolha de hoje em diante.");
    assert.equal(problemaDoPrazo("2026-11-23", "2026-11-23"), null);
    assert.equal(problemaDoPrazo("2028-02-29", "2026-11-23"), null);
    assert.equal(problemaDoPrazo("2026-11-10", "2026-11-23", "2026-11-10"), null);
    assert.equal(problemaDoPrazo("2026-11-11", "2026-11-23", "2026-11-10"), "a data já passou; escolha de hoje em diante.");
  });
});
