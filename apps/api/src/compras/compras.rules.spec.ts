import type { Acesso, AcaoDoPedido, EtapaDeCompra } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import {
  acoesPermitidas,
  autoriaDaAcao,
  observacaoDaAcao,
  aceitaCotacao,
  papelEmCompras,
  passagemInicial,
  planejarAcao,
  prazoDaEtapa,
  problemaDaEdicao,
  somarValores,
  type EstadoDoPedido,
  type PlanoDaAcao,
} from "./compras.rules";
import { diaEmManaus } from "./dias-uteis";

// Segunda, 23/11/2026, 10:00 em Manaus.
const AGORA = new Date("2026-11-23T14:00:00Z");
const PRAZO_FUTURO = new Date("2026-12-31T03:59:59.999Z");
const PRAZO_PASSADO = new Date("2026-11-20T03:59:59.999Z");
const COTACAO_A = "00000000-0000-0000-0000-0000000000a1";
const COTACAO_B = "00000000-0000-0000-0000-0000000000b1";

const pedido = (etapa: EtapaDeCompra, extra: Partial<EstadoDoPedido> = {}): EstadoDoPedido => ({
  etapa,
  canceladoEm: null,
  origemAtendimento: etapa === "pedido_gerado" || etapa === "analise_estoque" ? null : "aquisicao",
  cotacaoSelecionadaId: null,
  cotacoes: [],
  passagemAberta: etapa === "concluido" ? null : { prazoEm: PRAZO_FUTURO },
  ...extra,
});

function aplicar(estado: EstadoDoPedido, acao: AcaoDoPedido): PlanoDaAcao {
  const resultado = planejarAcao(estado, acao, AGORA);
  if (!resultado.ok) throw new Error(`recusado: ${resultado.recusa.mensagem}`);
  return resultado.plano;
}

function recusa(estado: EstadoDoPedido, acao: AcaoDoPedido) {
  const resultado = planejarAcao(estado, acao, AGORA);
  if (resultado.ok) throw new Error("devia recusar");
  return resultado.recusa;
}

describe("caminho da aquisição externa", () => {
  it("percorre as sete etapas, abrindo e fechando uma passagem por vez", () => {
    expect(passagemInicial(AGORA)).toMatchObject({ etapa: "pedido_gerado", prazoDiasUteis: 2 });

    const analise = aplicar(pedido("pedido_gerado"), { acao: "iniciar_analise" });
    expect(analise.alteracoes.etapa).toBe("analise_estoque");
    expect(analise.fecharPassagem).toEqual({ saiuEm: AGORA, cumpriuPrazo: true });
    expect(analise.abrirPassagem).toMatchObject({ etapa: "analise_estoque", prazoDiasUteis: 2 });

    const cotacoes = aplicar(pedido("analise_estoque"), { acao: "decidir_estoque", origem: "aquisicao" });
    expect(cotacoes.alteracoes).toMatchObject({ etapa: "cotacoes", origemAtendimento: "aquisicao" });
    expect(cotacoes.abrirPassagem?.prazoDiasUteis).toBe(5);

    const cotadas = [{ id: COTACAO_A, valorTotal: "1550.00", prazoEntregaDias: 12 }];
    const selecao = aplicar(pedido("cotacoes", { cotacoes: cotadas }), { acao: "selecionar_cotacao", cotacaoId: COTACAO_A });
    expect(selecao.alteracoes).toEqual({ cotacaoSelecionadaId: COTACAO_A, valorCotado: "1550.00" });
    expect(selecao.fecharPassagem).toBeNull();
    expect(selecao.abrirPassagem).toBeNull();

    const aprovacao = aplicar(pedido("cotacoes", { cotacoes: cotadas, cotacaoSelecionadaId: COTACAO_A }), { acao: "enviar_para_aprovacao" });
    expect(aprovacao.abrirPassagem).toMatchObject({ etapa: "aprovacao_compra", prazoDiasUteis: 2 });

    const pagamento = aplicar(pedido("aprovacao_compra"), { acao: "aprovar" });
    expect(pagamento.abrirPassagem).toMatchObject({ etapa: "pagamento", prazoDiasUteis: 2 });

    const retirada = aplicar(pedido("pagamento", { cotacoes: cotadas, cotacaoSelecionadaId: COTACAO_A }), { acao: "registrar_pagamento", forma: "pix" });
    expect(retirada.alteracoes).toMatchObject({ etapa: "retirada", formaPagamento: "pix" });
    // O fornecedor declarou 12 dias úteis, mais que os 5 da régua.
    expect(retirada.abrirPassagem?.prazoDiasUteis).toBe(12);

    const concluido = aplicar(pedido("retirada"), { acao: "confirmar_recebimento", recebidoEm: "2026-11-23", valorFaturado: "1549.90" });
    expect(concluido.alteracoes).toEqual({ etapa: "concluido", concluidoEm: AGORA, valorFaturado: "1549.90" });
    expect(concluido.abrirPassagem).toBeNull();
    expect(concluido.fecharPassagem).not.toBeNull();
  });

  it("enviar para aprovação exige cotação escolhida", () => {
    expect(recusa(pedido("cotacoes"), { acao: "enviar_para_aprovacao" }).codigo).toBe("CONFLITO_ESTADO");
  });

  it("selecionar uma cotação de outro pedido é recusado", () => {
    const estado = pedido("cotacoes", { cotacoes: [{ id: COTACAO_A, valorTotal: "1.00", prazoEntregaDias: null }] });
    expect(recusa(estado, { acao: "selecionar_cotacao", cotacaoId: COTACAO_B }).codigo).toBe("REQUISICAO_INVALIDA");
  });

  it("o dia do recebimento não pode ser futuro", () => {
    expect(recusa(pedido("retirada", { origemAtendimento: "estoque" }), { acao: "confirmar_recebimento", recebidoEm: "2026-11-24" }).codigo).toBe("REQUISICAO_INVALIDA");
  });

  it("concluir aquisição exige o valor faturado", () => {
    expect(recusa(pedido("retirada"), { acao: "confirmar_recebimento", recebidoEm: "2026-11-23" }).codigo).toBe("REQUISICAO_INVALIDA");
  });
});

describe("atendimento por estoque", () => {
  it("vai da análise direto para a retirada com 5 dias úteis", () => {
    const plano = aplicar(pedido("analise_estoque"), { acao: "decidir_estoque", origem: "estoque" });
    expect(plano.alteracoes).toMatchObject({ etapa: "retirada", origemAtendimento: "estoque" });
    expect(plano.abrirPassagem?.prazoDiasUteis).toBe(5);
    // Segunda + 5 dias úteis = segunda seguinte.
    expect(diaEmManaus(plano.abrirPassagem!.prazoEm)).toBe("2026-11-30");
  });

  it("conclui sem valor faturado", () => {
    const plano = aplicar(pedido("retirada", { origemAtendimento: "estoque" }), { acao: "confirmar_recebimento", recebidoEm: "2026-11-23" });
    expect(plano.alteracoes.valorFaturado).toBeNull();
  });
});

describe("revisar", () => {
  it("volta para cotações, limpa a cotação escolhida e abre uma nova passagem", () => {
    const plano = aplicar(pedido("aprovacao_compra", { cotacaoSelecionadaId: COTACAO_A }), { acao: "revisar", motivo: "Preço acima do orçado" });
    expect(plano.alteracoes).toEqual({ etapa: "cotacoes", cotacaoSelecionadaId: null, valorCotado: null });
    expect(plano.fecharPassagem).not.toBeNull();
    expect(plano.abrirPassagem).toMatchObject({ etapa: "cotacoes", prazoDiasUteis: 5 });
  });

  it("só vale na aprovação", () => {
    expect(recusa(pedido("pagamento"), { acao: "revisar", motivo: "x" }).codigo).toBe("CONFLITO_ESTADO");
  });
});

describe("cancelar", () => {
  it.each(["pedido_gerado", "analise_estoque", "cotacoes", "aprovacao_compra", "pagamento", "retirada"] as const)(
    "vale em %s, guarda a etapa e fecha a passagem sem abrir outra",
    (etapa) => {
      const plano = aplicar(pedido(etapa), { acao: "cancelar", motivo: "Cliente desistiu" });
      expect(plano.alteracoes).toEqual({ canceladoEm: AGORA, motivoCancelamento: "Cliente desistiu" });
      expect(plano.fecharPassagem).not.toBeNull();
      expect(plano.abrirPassagem).toBeNull();
    },
  );

  it("não vale em pedido concluído nem já cancelado", () => {
    expect(recusa(pedido("concluido"), { acao: "cancelar", motivo: "x" }).codigo).toBe("CONFLITO_ESTADO");
    expect(recusa(pedido("cotacoes", { canceladoEm: AGORA }), { acao: "cancelar", motivo: "x" }).codigo).toBe("CONFLITO_ESTADO");
  });

  it("pedido cancelado não aceita mais nenhuma ação", () => {
    expect(recusa(pedido("pedido_gerado", { canceladoEm: AGORA }), { acao: "iniciar_analise" }).codigo).toBe("CONFLITO_ESTADO");
  });
});

describe("transições fora de ordem", () => {
  const casos: [EtapaDeCompra, AcaoDoPedido][] = [
    ["pedido_gerado", { acao: "decidir_estoque", origem: "estoque" }],
    ["analise_estoque", { acao: "aprovar" }],
    ["cotacoes", { acao: "registrar_pagamento", forma: "boleto" }],
    ["aprovacao_compra", { acao: "selecionar_cotacao", cotacaoId: COTACAO_A }],
    ["pagamento", { acao: "confirmar_recebimento", recebidoEm: "2026-11-23", valorFaturado: "1.00" }],
    ["retirada", { acao: "iniciar_analise" }],
    ["concluido", { acao: "aprovar" }],
  ];
  it.each(casos)("em %s recusa %o", (etapa, acao) => {
    expect(recusa(pedido(etapa), acao).codigo).toBe("CONFLITO_ESTADO");
  });
});

describe("prazo cumprido", () => {
  it("sair depois do prazo grava que não cumpriu", () => {
    const plano = aplicar(pedido("pedido_gerado", { passagemAberta: { prazoEm: PRAZO_PASSADO } }), { acao: "iniciar_analise" });
    expect(plano.fecharPassagem?.cumpriuPrazo).toBe(false);
  });
});

describe("prazoDaEtapa", () => {
  it("o prazo do fornecedor só estende a retirada da aquisição, e só para mais", () => {
    expect(prazoDaEtapa("retirada", "aquisicao", 12)).toBe(12);
    expect(prazoDaEtapa("retirada", "aquisicao", 3)).toBe(5);
    expect(prazoDaEtapa("retirada", "estoque", 12)).toBe(5);
    expect(prazoDaEtapa("cotacoes", "aquisicao", 12)).toBe(5);
  });
});

describe("acesso", () => {
  const compras: Acesso = { plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro", telas: ["suprimentos.compras"] }] };
  const fornecedoresSo: Acesso = { plataforma: null, departamentos: [{ departamento: "suprimentos", nivel: "membro", telas: ["suprimentos.fornecedores"] }] };
  const financeiroMembro: Acesso = { plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "membro" }] };
  const financeiroGerente: Acesso = { plataforma: null, departamentos: [{ departamento: "financeiro", nivel: "gerente" }] };
  const admin: Acesso = { plataforma: "admin", departamentos: [] };

  it("quem opera Compras faz o fluxo, menos aprovar e pagar", () => {
    const papel = papelEmCompras(compras);
    expect(acoesPermitidas(pedido("cotacoes"), papel)).toEqual(["selecionar_cotacao", "enviar_para_aprovacao", "cancelar"]);
    expect(acoesPermitidas(pedido("aprovacao_compra"), papel)).toEqual(["cancelar"]);
    expect(acoesPermitidas(pedido("pagamento"), papel)).toEqual(["cancelar"]);
  });

  it("aprovar e revisar são do gerente do Financeiro; pagar, de quem é do Financeiro", () => {
    expect(acoesPermitidas(pedido("aprovacao_compra"), papelEmCompras(financeiroMembro))).toEqual([]);
    expect(acoesPermitidas(pedido("aprovacao_compra"), papelEmCompras(financeiroGerente))).toEqual(["aprovar", "revisar", "cancelar"]);
    expect(acoesPermitidas(pedido("pagamento"), papelEmCompras(financeiroMembro))).toEqual(["registrar_pagamento"]);
  });

  it("a mesma pessoa pode fazer tudo (sem segregação de função)", () => {
    const papel = papelEmCompras(admin);
    expect(acoesPermitidas(pedido("aprovacao_compra"), papel)).toEqual(["aprovar", "revisar", "cancelar"]);
    expect(acoesPermitidas(pedido("pagamento"), papel)).toEqual(["registrar_pagamento", "cancelar"]);
  });

  it("a tela de Fornecedores não dá acesso a Compras", () => {
    expect(acoesPermitidas(pedido("pedido_gerado"), papelEmCompras(fornecedoresSo))).toEqual([]);
  });

  it("pedido encerrado não tem ações", () => {
    expect(acoesPermitidas(pedido("concluido"), papelEmCompras(admin))).toEqual([]);
  });
});

describe("cotação e edição", () => {
  it("cotação nova só na etapa de cotações", () => {
    expect(aceitaCotacao(pedido("cotacoes"))).toBe(true);
    expect(aceitaCotacao(pedido("aprovacao_compra"))).toBe(false);
    expect(aceitaCotacao(pedido("cotacoes", { canceladoEm: AGORA }))).toBe(false);
  });

  it("itens só mudam até a análise de estoque", () => {
    expect(problemaDaEdicao(pedido("analise_estoque"), true)).toBeNull();
    expect(problemaDaEdicao(pedido("cotacoes"), true)?.codigo).toBe("CONFLITO_ESTADO");
    expect(problemaDaEdicao(pedido("cotacoes"), false)).toBeNull();
    expect(problemaDaEdicao(pedido("concluido"), false)?.codigo).toBe("CONFLITO_ESTADO");
  });
});

describe("somarValores", () => {
  it("soma em centavos", () => {
    expect(somarValores("0.1", "0.2")).toBe("0.30");
    expect(somarValores("1500", null)).toBe("1500.00");
    expect(somarValores("1499.99", "50.01")).toBe("1550.00");
  });
});

describe("autoria", () => {
  const PESSOA = "00000000-0000-0000-0000-0000000000e1";

  it("cada marco grava quem fez e quando", () => {
    expect(autoriaDaAcao({ acao: "decidir_estoque", origem: "estoque" }, PESSOA, AGORA)).toEqual({ estoqueDecididoEm: AGORA, estoqueDecididoPorId: PESSOA });
    expect(autoriaDaAcao({ acao: "aprovar" }, PESSOA, AGORA)).toEqual({ aprovadoEm: AGORA, aprovouId: PESSOA });
    expect(autoriaDaAcao({ acao: "registrar_pagamento", forma: "pix", observacao: "à vista" }, PESSOA, AGORA))
      .toEqual({ pagamentoRegistradoEm: AGORA, pagamentoRegistradoPorId: PESSOA, pagamentoObservacao: "à vista" });
    expect(autoriaDaAcao({ acao: "cancelar", motivo: "x" }, PESSOA, AGORA)).toEqual({ canceladoPorId: PESSOA });
  });

  it("o recebimento grava quem e o dia informado, no início do dia em Manaus", () => {
    expect(autoriaDaAcao({ acao: "confirmar_recebimento", recebidoEm: "2026-11-20" }, PESSOA, AGORA))
      .toEqual({ recebimentoConfirmadoPorId: PESSOA, recebidoEm: new Date("2026-11-20T04:00:00.000Z") });
  });

  it("revisar apaga quem escolheu a cotação", () => {
    expect(autoriaDaAcao({ acao: "revisar", motivo: "caro" }, PESSOA, AGORA)).toEqual({ cotacaoSelecionadaEm: null, selecionouCotacaoId: null });
  });

  it("a passagem guarda o motivo da revisão e do cancelamento", () => {
    expect(observacaoDaAcao({ acao: "revisar", motivo: "caro" })).toBe("caro");
    expect(observacaoDaAcao({ acao: "cancelar", motivo: "desistiu" })).toBe("desistiu");
    expect(observacaoDaAcao({ acao: "aprovar", observacao: "ok" })).toBe("ok");
    expect(observacaoDaAcao({ acao: "selecionar_cotacao", cotacaoId: COTACAO_A })).toBeNull();
  });
});
