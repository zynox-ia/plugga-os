import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { PedidoDeCompra } from "@plugga/shared";

import {
  atividadesDoPedido,
  atividadesPorDia,
  camposDoPedidoAlterados,
  comparacaoComOrcado,
  destaquesDasCotacoes,
  diasUteisEntre,
  etapasPuladas,
  horaEmManaus,
  prazoDaEtapaAtual,
} from "../app/lib/ficha-do-pedido.ts";

const A = "0b7e1c6a-1f2d-4c3b-9a8e-111111111111";
const B = "0b7e1c6a-1f2d-4c3b-9a8e-222222222222";
const C = "0b7e1c6a-1f2d-4c3b-9a8e-333333333333";
const PESSOA = { id: A, nome: "Pessoa Teste" };

const cotacao = (id: string, total: string, prazo: number | null): PedidoDeCompra["cotacoes"][number] => ({
  id, fornecedor: { id, nome: `Fornecedor ${id.slice(-1)}`, ativo: true }, valor: total, valorFrete: null, valorTotal: total,
  prazoEntregaDias: prazo, condicoesPagamento: null, arquivo: { nome: "cotacao.pdf", tamanhoBytes: 10, tipo: "application/pdf", url: "/x" },
  selecionada: false, criada: { por: PESSOA, em: "2026-11-20T14:00:00.000Z" },
});

const pedido = (parcial: Partial<PedidoDeCompra> = {}): PedidoDeCompra => ({
  id: A, empresa: "plugga", numero: 7, titulo: "Cabos", descricao: null,
  destino: { tipo: "interno", obra: null, cliente: null },
  itens: [{ id: B, descricao: "Cabo", quantidade: "10.000", unidade: "m", itemDeEstoque: null }],
  prazoEntregaDesejado: "2026-12-04", etapa: "cotacoes", situacao: "em_andamento", origemAtendimento: "aquisicao",
  valorOrcado: "1000.00", valorCotado: null, valorFaturado: null, solicitante: PESSOA, responsavel: null,
  cotacoes: [], cotacaoSelecionadaId: null, pagamento: null, comprovantePendente: null,
  passagens: [{ etapa: "cotacoes", entrouEm: "2026-11-20T13:00:00.000Z", prazoDiasUteis: 5, prazoEm: "2026-11-28T03:59:59.999Z", saiuEm: null, cumpriuPrazo: null, situacaoDoPrazo: "no_prazo", responsavel: null }],
  marcos: { criado: { por: PESSOA, em: "2026-11-18T12:00:00.000Z" }, analiseIniciada: null, estoqueDecidido: null, cotacaoSelecionada: null, aprovado: null, recebimentoConfirmado: null, cancelado: null },
  acoesPermitidas: [], podeEditar: true, podeRegistrarCotacao: true,
  createdAt: "2026-11-18T12:00:00.000Z", updatedAt: "2026-11-20T14:00:00.000Z",
  ...parcial,
});

describe("dias úteis e prazo da etapa", () => {
  it("conta só segunda a sexta, nos dois sentidos", () => {
    assert.equal(diasUteisEntre("2026-11-20", "2026-11-27"), 5); // sexta → sexta
    assert.equal(diasUteisEntre("2026-11-21", "2026-11-23"), 1); // sábado → segunda
    assert.equal(diasUteisEntre("2026-11-23", "2026-11-23"), 0);
    assert.equal(diasUteisEntre("2026-11-27", "2026-11-24"), -3);
  });

  it("hora no relógio de Manaus", () => {
    assert.equal(horaEmManaus("2026-11-24T03:30:00.000Z"), "23:30");
  });

  it("prazo em palavras: faltam, vence hoje, vencida", () => {
    assert.deepEqual(prazoDaEtapaAtual(pedido(), "2026-11-25"), { tom: "ok", texto: "Faltam 2 dias úteis", ate: "2026-11-27" });
    assert.equal(prazoDaEtapaAtual(pedido(), "2026-11-26")?.texto, "Faltam 1 dia útil");
    const hoje = pedido({ passagens: [{ ...pedido().passagens[0]!, situacaoDoPrazo: "vence_hoje" }] });
    assert.equal(prazoDaEtapaAtual(hoje, "2026-11-27")?.texto, "Vence hoje");
    const vencida = pedido({ passagens: [{ ...pedido().passagens[0]!, situacaoDoPrazo: "vencido" }] });
    assert.deepEqual(prazoDaEtapaAtual(vencida, "2026-12-01"), { tom: "vencido", texto: "Etapa vencida há 2 dias úteis", ate: "2026-11-27" });
    assert.equal(prazoDaEtapaAtual(pedido({ situacao: "cancelado" }), "2026-11-25"), null);
  });
});

describe("cotações", () => {
  it("vencedora × orçado em centavos, sem erro de ponto flutuante", () => {
    assert.deepEqual(comparacaoComOrcado("1000.00", "950.10")?.abaixo, true);
    assert.equal(comparacaoComOrcado("1000.00", "950.10")?.diferenca.replace(/\s/g, " "), "R$ 49,90");
    assert.equal(comparacaoComOrcado("0.30", "0.10")?.diferenca.replace(/\s/g, " "), "R$ 0,20");
    assert.equal(comparacaoComOrcado("1000.00", "1200.00")?.abaixo, false);
    assert.equal(comparacaoComOrcado(null, "1.00"), null);
  });

  it("menor total e menor prazo só com duas ou mais", () => {
    assert.equal(destaquesDasCotacoes([cotacao(A, "10.00", 5)]).menorTotal.size, 0);
    const d = destaquesDasCotacoes([cotacao(A, "10.00", 5), cotacao(B, "8.00", 9), cotacao(C, "8.00", null)]);
    assert.deepEqual([...d.menorTotal], [B, C]);
    assert.deepEqual([...d.menorPrazo], [A]);
  });

  it("estoque pula cotações, aprovação e pagamento", () => {
    assert.deepEqual([...etapasPuladas({ origemAtendimento: "estoque" })], ["cotacoes", "aprovacao_compra", "pagamento"]);
    assert.equal(etapasPuladas({ origemAtendimento: "aquisicao" }).size, 0);
  });
});

describe("atividade do pedido", () => {
  it("monta a partir dos marcos, mais recente primeiro, e agrupa por dia de Manaus", () => {
    const p = pedido({
      cotacoes: [cotacao(B, "900.00", 5)], cotacaoSelecionadaId: B,
      marcos: { ...pedido().marcos, cancelado: { por: PESSOA, em: "2026-11-24T03:00:00.000Z", motivo: "Obra adiada" } },
      situacao: "cancelado",
    });
    const lista = atividadesDoPedido(p);
    assert.deepEqual(lista.map((a) => a.chave), ["cancelado", `cotacao-${B}`, "criado"]);
    assert.equal(lista[0]?.nota, "Obra adiada");
    assert.equal(lista[0]?.texto, "cancelou o pedido em Cotações");
    const dias = atividadesPorDia(lista, "2026-11-23");
    assert.deepEqual(dias.map((d) => d.rotulo), ["Hoje", "20 nov 2026", "18 nov 2026"]);
  });
});

describe("edição envia só o que mudou", () => {
  const corpo = (parcial: Record<string, unknown> = {}) => ({
    empresa: "plugga", titulo: "Cabos", descricao: null, destino: "interno", obraId: null, clientId: null,
    itens: [{ descricao: "Cabo", quantidade: "10", unidade: "m" }], prazoEntregaDesejado: "2026-12-04", valorOrcado: "1000.00", responsavelId: null, ...parcial,
  });

  it("nada mudou: corpo vazio, mesmo com a quantidade escrita de outro jeito", () => {
    assert.deepEqual(camposDoPedidoAlterados(pedido(), corpo(), true), {});
  });

  it("título e destino: o destino vai com o vínculo", () => {
    assert.deepEqual(camposDoPedidoAlterados(pedido(), corpo({ titulo: "Cabos 6 mm", destino: "obra", obraId: C }), true),
      { titulo: "Cabos 6 mm", destino: "obra", obraId: C, clientId: null });
  });

  it("itens fora da etapa editável não vão", () => {
    assert.deepEqual(camposDoPedidoAlterados(pedido(), corpo({ itens: [{ descricao: "Outro", quantidade: "1", unidade: "un" }] }), false), {});
  });
});
