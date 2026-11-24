import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LancamentoResumo } from "@plugga/shared";

import {
  cardAtivo,
  cardsClicaveis,
  comSituacao,
  comVisao,
  somaDoTipo,
  comVencimento,
  competenciaLegivel,
  consultaDosLancamentos,
  filtroAoClicarNoCard,
  hrefDosLancamentos,
  lerFiltrosDosLancamentos,
  opcoesDeSituacaoPara,
  prazoDoLancamento,
  quantosFiltros,
  resumoDoLancamento,
  rotuloDoValor,
  seloDaEtapa,
  temFiltroNosLancamentos,
} from "../app/lib/financeiro.ts";

// O campo `omie` sai do contrato com a extinção da integração (24/11/2026). Por espalhamento,
// o objeto vale com o contrato de antes e com o de depois; sai daqui junto com o campo.
const legadoDoOmie = { omie: { estado: "nao_enviado", codigo: null, motivo: null } } as const;
const base: LancamentoResumo = {
  id: "6f1c2a3b-0000-4000-8000-000000000001",
  tipo: "saida",
  codigo: "CP-0412",
  empresa: "waze",
  etapa: "aprovada",
  coluna: "aberto",
  emCobranca: false,
  cancelado: false,
  favorecido: { tipo: "fornecedor", id: "6f1c2a3b-0000-4000-8000-000000000002", nome: "Solarvolt Distribuidora (sintético)" },
  categoria: { id: "6f1c2a3b-0000-4000-8000-000000000003", codigo: "2.01.01", nome: "Material de obra", tipo: "despesa", natureza: "material" },
  contaCorrente: null,
  descricao: "Kit solar 8,2 kWp",
  valor: "27350.00",
  vencimento: "2026-11-24",
  competencia: null,
  prazo: { situacao: "no_prazo", dias: 1 },
  liquidadoEm: null,
  anexos: 3,
  ...legadoDoOmie,
  origem: { tipo: "pedido_de_compra", pedidoDeCompra: { id: "6f1c2a3b-0000-4000-8000-000000000004", numero: 131 } },
  createdAt: "2026-11-21T16:02:00.000Z",
};
const entrada = (parcial: Partial<LancamentoResumo>): LancamentoResumo => ({ ...base, tipo: "entrada", codigo: "CR-2083", etapa: "gerada", coluna: "preparo", competencia: "2026-10", descricao: "", ...parcial });

describe("filtros dos Lançamentos no endereço", () => {
  it("Cards é o padrão e não vai para a URL; valor desconhecido cai no padrão", () => {
    assert.deepEqual(lerFiltrosDosLancamentos({}), { visao: "cards" });
    assert.deepEqual(lerFiltrosDosLancamentos({ visao: "kanban", situacao: "pagas", empresa: "outra", vencimento: "30", busca: "   " }), { visao: "cards" });
    assert.equal(hrefDosLancamentos({ visao: "cards" }), "/financeiro/lancamentos");
  });

  it("ida e volta pelo endereço preserva visão, filtros e a ficha", () => {
    const f = lerFiltrosDosLancamentos({ visao: "lista", situacao: "receber-cobranca", empresa: "plugga", vencimento: "7", busca: " Clínica " });
    assert.deepEqual(f, { visao: "lista", situacao: "receber-cobranca", empresa: "plugga", vencimento: "7", busca: "Clínica" });
    const href = hrefDosLancamentos(f, "abc");
    assert.equal(href, "/financeiro/lancamentos?visao=lista&situacao=receber-cobranca&empresa=plugga&vencimento=7&busca=Cl%C3%ADnica&lancamento=abc");
    assert.deepEqual(lerFiltrosDosLancamentos(Object.fromEntries(new URL(href, "http://x").searchParams)), f);
  });

  it("a API recebe só o preenchido, e o quadro não leva situação", () => {
    const f = lerFiltrosDosLancamentos({ situacao: "erro", empresa: "waze" });
    assert.deepEqual(consultaDosLancamentos(f, "lista"), { situacao: "erro", empresa: "waze" });
    assert.deepEqual(consultaDosLancamentos(f, "quadro"), { empresa: "waze" });
    assert.deepEqual(consultaDosLancamentos({ visao: "cards" }, "lista"), {});
  });

  it("Canceladas e Vencimento não andam juntos: a escolha nova desliga a outra (a API recusa os dois)", () => {
    assert.deepEqual(lerFiltrosDosLancamentos({ situacao: "cancelado", vencimento: "7" }), { visao: "cards", situacao: "cancelado" });
    assert.deepEqual(comSituacao({ visao: "lista", vencimento: "mes", empresa: "waze" }, "cancelado"), { visao: "lista", situacao: "cancelado", empresa: "waze" });
    assert.deepEqual(comSituacao({ visao: "lista", vencimento: "mes" }, "pagar"), { visao: "lista", situacao: "pagar", vencimento: "mes" });
    assert.deepEqual(comSituacao({ visao: "lista", situacao: "pagar" }, undefined), { visao: "lista" });
    assert.deepEqual(comVencimento({ visao: "cards", situacao: "cancelado" }, "hoje"), { visao: "cards", vencimento: "hoje" });
    assert.deepEqual(comVencimento({ visao: "cards", situacao: "pagar", vencimento: "7" }, undefined), { visao: "cards", situacao: "pagar" });
  });

  it("conta os filtros ligados, sem contar a visão", () => {
    assert.equal(temFiltroNosLancamentos({ visao: "lista" }), false);
    assert.equal(quantosFiltros({ visao: "quadro", empresa: "plugga", busca: "x" }), 2);
  });
});

describe("filtro de Situação", () => {
  it("quem alcança os dois tipos vê os 4 grupos, na ordem do protótipo", () => {
    const opcoes = opcoesDeSituacaoPara({ saidas: true, entradas: true });
    assert.deepEqual([...new Set(opcoes.map((o) => o.grupo))], [undefined, "A pagar", "A receber", "Concluídas", "Atenção"]);
    assert.equal(opcoes[0]?.valor, "");
  });

  it("quem só paga não vê o grupo A receber nem Recebidas", () => {
    // A situação "Com erro no OMIE" saiu com a extinção da integração (24/11/2026).
    assert.ok(!opcoesDeSituacaoPara({ saidas: true, entradas: true }).some((o) => (o.valor as string) === "erro"));
    const opcoes = opcoesDeSituacaoPara({ saidas: true, entradas: false });
    assert.ok(!opcoes.some((o) => o.grupo === "A receber" || o.valor === "recebido"));
    assert.ok(opcoes.some((o) => o.valor === "pago") && opcoes.some((o) => o.valor === "vencidos"));
  });
});

describe("card do lançamento", () => {
  it("o selo diz o que a etapa pede, em cada tipo", () => {
    assert.equal(seloDaEtapa({ ...base, etapa: "aberta" }).curto, "Para aprovar");
    assert.equal(seloDaEtapa(base).curto, "Para pagar");
    assert.deepEqual(seloDaEtapa({ ...base, etapa: "paga" }), { curto: "A conciliar", completo: "Paga · a conciliar" });
    assert.equal(seloDaEtapa(entrada({ etapa: "gerada" })).curto, "Emitir a NF");
    assert.equal(seloDaEtapa(entrada({ etapa: "nf_emitida" })).curto, "Anexar o boleto");
    assert.equal(seloDaEtapa(entrada({ etapa: "boleto_gerado" })).curto, "Enviar ao cliente");
    assert.deepEqual(seloDaEtapa(entrada({ etapa: "enviada" })), { curto: "Aguardando", completo: "Aguardando pagamento" });
    assert.equal(seloDaEtapa(entrada({ etapa: "enviada", emCobranca: true })).curto, "Em cobrança");
    assert.equal(seloDaEtapa({ ...base, cancelado: true }).curto, "Cancelada");
  });

  it("o prazo só ganha cor quando sinaliza", () => {
    assert.deepEqual(prazoDoLancamento(base), { data: "24 nov", relativo: "vence amanhã", tom: null });
    assert.deepEqual(prazoDoLancamento({ ...base, prazo: { situacao: "no_prazo", dias: 4 } }), { data: "24 nov", relativo: "vence em 4 dias", tom: null });
    assert.deepEqual(prazoDoLancamento({ ...base, prazo: { situacao: "vence_hoje", dias: 0 } }).tom, "alerta");
    const vencido = { ...base, vencimento: "2026-11-20", prazo: { situacao: "vencido" as const, dias: -3 } };
    assert.deepEqual(prazoDoLancamento(vencido), { data: "20 nov", relativo: "vencido há 3 dias", tom: "perigo" });
    assert.equal(prazoDoLancamento({ ...vencido, prazo: { situacao: "vencido", dias: -1 } }).relativo, "vencido há 1 dia");
  });

  it("liquidado mostra o dia do pagamento ou do recebimento", () => {
    assert.deepEqual(prazoDoLancamento({ ...base, etapa: "paga", prazo: null, liquidadoEm: "2026-11-10" }), { data: "10 nov", relativo: "paga", tom: null });
    assert.equal(prazoDoLancamento(entrada({ etapa: "recebida", prazo: null, liquidadoEm: "2026-11-14" })).relativo, "recebida");
    assert.equal(prazoDoLancamento({ ...base, etapa: "conciliada", prazo: null, liquidadoEm: "2026-11-10" }).relativo, "conciliada");
    assert.equal(prazoDoLancamento({ ...base, cancelado: true, prazo: null }).relativo, "cancelada");
  });

  it("a linha de baixo é a descrição da saída ou a competência da entrada", () => {
    assert.equal(competenciaLegivel("2026-10"), "out/2026");
    assert.equal(resumoDoLancamento(base), "Kit solar 8,2 kWp");
    assert.equal(resumoDoLancamento(entrada({})), "Competência out/2026");
    assert.equal(resumoDoLancamento(entrada({ descricao: "1 UC" })), "Competência out/2026 · 1 UC");
    assert.equal(rotuloDoValor(base), "a pagar");
    assert.equal(rotuloDoValor({ ...base, liquidadoEm: "2026-11-10" }), "pago");
    assert.equal(rotuloDoValor(entrada({})), "a receber");
  });
});

describe("Quadro sem situação e totais da lista", () => {
  it("um link do Quadro com situação descarta a situação ao abrir", () => {
    assert.deepEqual(lerFiltrosDosLancamentos({ visao: "quadro", situacao: "vencidos", empresa: "plugga" }), { visao: "quadro", empresa: "plugga" });
  });

  it("ir para o Quadro desliga a situação, que não voltaria escondida na Lista; os outros filtros ficam", () => {
    assert.deepEqual(comVisao({ visao: "lista", situacao: "vencidos", empresa: "waze", vencimento: "7" }, "quadro"), { visao: "quadro", empresa: "waze", vencimento: "7" });
    assert.deepEqual(comVisao({ visao: "quadro", empresa: "waze" }, "cards"), { visao: "cards", empresa: "waze" });
    assert.deepEqual(comVisao({ visao: "cards", situacao: "pagar" }, "lista"), { visao: "lista", situacao: "pagar" });
  });

  it("no Quadro os metric cards não são clicáveis; nas outras visões, são", () => {
    assert.equal(cardsClicaveis({ visao: "quadro" }), false);
    assert.equal(cardsClicaveis({ visao: "cards" }), true);
    assert.equal(cardsClicaveis({ visao: "lista" }), true);
  });

  it("soma por tipo em centavos inteiros, sem erro de float", () => {
    const itens = [{ tipo: "saida" as const, valor: "0.10" }, { tipo: "saida" as const, valor: "0.20" }, { tipo: "entrada" as const, valor: "27350.00" }, { tipo: "saida" as const, valor: "1742.18" }];
    assert.equal(somaDoTipo(itens, "saida"), "1742.48");
    assert.equal(somaDoTipo(itens, "entrada"), "27350.00");
    assert.equal(somaDoTipo([], "entrada"), "0.00");
    assert.equal(somaDoTipo([{ tipo: "saida", valor: "999999999999.99" }, { tipo: "saida", valor: "0.01" }], "saida"), "1000000000000.00");
    assert.equal(somaDoTipo([{ tipo: "saida", valor: "5" }, { tipo: "saida", valor: "0.5" }], "saida"), "5.50");
  });
});

describe("metric cards ligam o filtro", () => {
  it("clicar liga o filtro do card; clicar de novo desliga, sem perder empresa e busca", () => {
    const f = { visao: "lista" as const, empresa: "plugga" as const, busca: "x" };
    const ligado = filtroAoClicarNoCard(f, "aReceber");
    assert.deepEqual(ligado, { ...f, situacao: "receber", vencimento: "mes" });
    assert.equal(cardAtivo(ligado, "aReceber"), true);
    assert.equal(cardAtivo(ligado, "aPagar"), false);
    assert.deepEqual(filtroAoClicarNoCard(ligado, "aReceber"), f);
    assert.deepEqual(filtroAoClicarNoCard(ligado, "vencidos"), { ...f, situacao: "vencidos" });
  });
});
