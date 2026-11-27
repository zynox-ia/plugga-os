import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Acesso, AtendimentoPeloEstoque, PedidoDeCompra } from "@plugga/shared";

import type { TipoDeErroApi } from "../app/lib/api-core.ts";

import {
  atividadesDoPedido,
  atividadesPorDia,
  avisoDaAcao,
  camposDoPedidoAlterados,
  comparacaoComOrcado,
  destaquesDasCotacoes,
  diasUteisEntre,
  etapasPuladas,
  falhaDaFicha,
  horaEmManaus,
  opcaoDoEstoque,
  prazoDaEtapaAtual,
  resumoDaTrilha,
  textoDaRecusa,
  tituloDoConcluido,
  vinculoDaContaAPagar,
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
  passagens: [{ etapa: "cotacoes", entrouEm: "2026-11-20T13:00:00.000Z", prazoDiasUteis: 5, prazoEm: "2026-11-28T03:59:59.999Z", saiuEm: null, cumpriuPrazo: null, situacaoDoPrazo: "no_prazo", responsavel: null, observacao: null }],
  marcos: { criado: { por: PESSOA, em: "2026-11-18T12:00:00.000Z" }, analiseIniciada: null, estoqueDecidido: null, cotacaoSelecionada: null, aprovado: null, revisoes: [], recebimentoConfirmado: null, cancelado: null },
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
      marcos: { ...pedido().marcos, revisoes: [{ por: PESSOA, em: "2026-11-21T15:00:00.000Z", motivo: "Pedir frete incluso" }], cancelado: { por: PESSOA, em: "2026-11-24T03:00:00.000Z", motivo: "Obra adiada" } },
      situacao: "cancelado",
    });
    const lista = atividadesDoPedido(p);
    assert.deepEqual(lista.map((a) => a.chave), ["cancelado", "revisao-0", `cotacao-${B}`, "criado"]);
    assert.equal(lista[1]?.nota, "Pedir frete incluso");
    assert.equal(lista[0]?.nota, "Obra adiada");
    assert.equal(lista[0]?.texto, "cancelou o pedido em Cotações");
    const dias = atividadesPorDia(lista, "2026-11-23");
    assert.deepEqual(dias.map((d) => d.rotulo), ["Hoje", "21 nov 2026", "20 nov 2026", "18 nov 2026"]);
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

describe("trilha resumida em 390 px", () => {
  it("posição no caminho do pedido e a próxima etapa", () => {
    assert.deepEqual(resumoDaTrilha({ etapa: "cotacoes", situacao: "em_andamento", origemAtendimento: "aquisicao" }), { posicao: 3, total: 7, atual: "Cotações", proxima: "Aprovação da compra" });
    // Pelo estoque o caminho tem 4 etapas: análise vai direto para a retirada.
    assert.deepEqual(resumoDaTrilha({ etapa: "retirada", situacao: "em_andamento", origemAtendimento: "estoque" }), { posicao: 3, total: 4, atual: "Retirada", proxima: "Concluído" });
    assert.deepEqual(resumoDaTrilha({ etapa: "concluido", situacao: "concluido", origemAtendimento: "aquisicao" }), { posicao: 7, total: 7, atual: "Concluído", proxima: null });
    assert.deepEqual(resumoDaTrilha({ etapa: "pagamento", situacao: "cancelado", origemAtendimento: "aquisicao" }), { posicao: 5, total: 7, atual: "Cancelado em Pagamento", proxima: null });
  });
});

describe("conta a pagar do pedido (PLU-341)", () => {
  const ligado = { NODE_ENV: "production", NEXT_PUBLIC_FINANCEIRO_HABILITADO: "true" };
  const desligado = { NODE_ENV: "production" };
  const comLancamentos: Acesso = { plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro", telas: ["financeiro.pagar"] }] };
  const soCompras: Acesso = { plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro", telas: ["suprimentos.compras"] }] };
  const conta = { id: A, codigo: "CP-0412", etapa: "aprovada" as const, cancelado: false };

  it("mostra o código, a etapa e o link da ficha do lançamento para quem abre os Lançamentos", () => {
    assert.deepEqual(vinculoDaContaAPagar(conta, comLancamentos, ligado), { codigo: "CP-0412", situacao: "Aprovada", href: `/financeiro/lancamentos?lancamento=${A}` });
    assert.equal(vinculoDaContaAPagar({ ...conta, etapa: "paga" }, comLancamentos, ligado)?.situacao, "Paga");
    assert.equal(vinculoDaContaAPagar({ ...conta, etapa: "conciliada", cancelado: true }, comLancamentos, ligado)?.situacao, "Cancelada");
  });

  it("quem tem só Compras vê o código e a etapa, sem link; com o portão desligado, também sem link", () => {
    assert.deepEqual(vinculoDaContaAPagar({ ...conta, etapa: "paga" }, soCompras, ligado), { codigo: "CP-0412", situacao: "Paga", href: null });
    assert.equal(vinculoDaContaAPagar(conta, comLancamentos, desligado)?.href, null);
  });

  it("não aparece sem conta ou sem a sessão", () => {
    assert.equal(vinculoDaContaAPagar(null, comLancamentos, ligado), null);
    assert.equal(vinculoDaContaAPagar(undefined, comLancamentos, ligado), null);
    assert.equal(vinculoDaContaAPagar(conta, null, ligado), null);
  });
});

describe("recusa e aviso das ações (PLU-328)", () => {
  it("a recusa mantém a mensagem da API, com o problema dos campos quando vier", () => {
    assert.equal(textoDaRecusa({ mensagem: "O pedido já foi cancelado.", porCampo: {} }), "O pedido já foi cancelado.");
    assert.equal(textoDaRecusa({ mensagem: "Confira os dados.", porCampo: { motivo: "informe o motivo." } }), "Confira os dados. informe o motivo.");
  });

  it("o recebimento do estoque não se anuncia como aquisição", () => {
    const receber = { acao: "confirmar_recebimento", recebidoEm: "2026-11-27" } as const;
    assert.equal(avisoDaAcao(receber, pedido({ origemAtendimento: "estoque" })), "Recebimento confirmado: material entregue do estoque.");
    assert.equal(avisoDaAcao(receber, pedido({ origemAtendimento: "aquisicao" })), "Recebimento confirmado: aquisição concluída.");
    assert.equal(tituloDoConcluido("estoque"), "Entrega do estoque concluída");
    assert.equal(tituloDoConcluido("aquisicao"), "Aquisição concluída");
  });

  it("os demais avisos seguem como eram", () => {
    assert.equal(avisoDaAcao({ acao: "decidir_estoque", origem: "estoque" }, pedido()), "Atendido pelo estoque: o pedido foi para Retirada.");
    assert.equal(avisoDaAcao({ acao: "decidir_estoque", origem: "aquisicao" }, pedido()), "Precisa comprar: o pedido foi para Cotações.");
    assert.equal(avisoDaAcao({ acao: "selecionar_cotacao", cotacaoId: B }, pedido({ cotacoes: [cotacao(B, "10.00", 2)] })), "Vencedora: Fornecedor 2.");
    assert.equal(avisoDaAcao({ acao: "aprovar" }, pedido()), "Compra aprovada.");
  });
});

describe("ficha que não abriu (PLU-328)", () => {
  const falhou = (tipo: TipoDeErroApi, mensagem: string) => ({ ok: false as const, erro: { tipo, mensagem, status: null } });

  it("sem pedido no endereço, ou com a ficha carregada, não há aviso", () => {
    assert.equal(falhaDaFicha(undefined, null), null);
    assert.equal(falhaDaFicha(A, { ok: true, dados: {} }), null);
  });

  it("só o 404, ou um link que não é de pedido, é não encontrado", () => {
    const naoAchou = { tipo: "nao_encontrada", texto: "Pedido não encontrado. O link pode estar errado." };
    assert.deepEqual(falhaDaFicha(A, falhou("naoEncontrado", "Pedido de compra não encontrado.")), naoAchou);
    assert.deepEqual(falhaDaFicha("abc", null), naoAchou);
  });

  it("falha de consulta diz o que houve, com a mensagem da API", () => {
    for (const [tipo, mensagem] of [["indisponivel", "O serviço está indisponível no momento. Tente novamente em instantes."], ["proibido", "Você não tem permissão para acessar este conteúdo."], ["rejeitado", "Muitas requisições."]] as const) {
      assert.deepEqual(falhaDaFicha(A, falhou(tipo, mensagem)), { tipo: "consulta", texto: `Não foi possível abrir o pedido. ${mensagem}` });
    }
  });
});

describe("atender pelo estoque segue a cobertura (PLU-328)", () => {
  const linha = (descricao: string, dados: Partial<AtendimentoPeloEstoque["itens"][number]> = {}): AtendimentoPeloEstoque["itens"][number] => ({
    itemDoPedidoId: B, descricao, quantidadePedida: "4.000", unidadePedida: "m", itemDeEstoque: { id: C, codigo: "EST-0001", nome: "Cabo", unidade: "m" }, disponivel: "9.000", pedidoDoItem: "4.000", atende: "4.000", motivo: null, ...dados,
  });
  const falta = linha("Cabo 6mm", { disponivel: "2.000", atende: "2.000", motivo: "insuficiente" });

  it("sem vínculo em algum item, nem consulta: o botão explica", () => {
    assert.deepEqual(opcaoDoEstoque(false, null), { disponivel: false, texto: "Para atender pelo estoque, todos os itens precisam estar vinculados a um item do estoque." });
  });

  it("espera a consulta e libera quando o estoque atende tudo", () => {
    assert.deepEqual(opcaoDoEstoque(true, null), { disponivel: false, texto: "Consultando o estoque…" });
    assert.deepEqual(opcaoDoEstoque(true, { atendeTudo: true, itens: [linha("Cabo 6mm")] }), { disponivel: true, texto: "Reserva o material no estoque. Vai direto para Retirada." });
  });

  it("quando não atende tudo, desabilita com o motivo", () => {
    assert.deepEqual(opcaoDoEstoque(true, { atendeTudo: false, itens: [linha("Fita"), falta] }),
      { disponivel: false, texto: "O estoque não atende tudo. Cabo 6mm: Disponível insuficiente. 2 m disponíveis." });
    const varias = opcaoDoEstoque(true, { atendeTudo: false, itens: [falta, linha("Fita", { motivo: "inativo", atende: "0.000" })] });
    assert.equal(varias.texto, "O estoque não atende tudo. Cabo 6mm: Disponível insuficiente. 2 m disponíveis. Mais 1 item sem atendimento acima.");
    assert.deepEqual(opcaoDoEstoque(true, { atendeTudo: false, itens: [] }), { disponivel: false, texto: "O estoque não atende tudo." });
  });

  it("sem resposta da consulta não bloqueia: quem recusa é o servidor", () => {
    assert.deepEqual(opcaoDoEstoque(true, "erro"), { disponivel: true, texto: "Não deu para consultar o estoque agora; o saldo é conferido ao decidir." });
  });
});
