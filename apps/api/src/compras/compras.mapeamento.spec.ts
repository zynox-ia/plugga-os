import { Prisma } from "@prisma/client";
import type { PedidoDeCompraResumo } from "@plugga/shared";
import { describe, expect, it } from "vitest";

import { montarQuadro, paraResumo, type LinhaDoResumo } from "./compras.mapeamento";

const AGORA = new Date("2026-11-25T14:00:00Z");

const linha = (dados: Partial<LinhaDoResumo> = {}): LinhaDoResumo => ({
  id: "00000000-0000-4000-8000-000000000501",
  companyId: "waze",
  numero: 131,
  titulo: "Cabos",
  descricao: null,
  destino: "cliente",
  obraId: null,
  clientId: "00000000-0000-4000-8000-000000000601",
  solicitanteId: "00000000-0000-4000-8000-000000000001",
  responsavelId: null,
  criadoPorId: null,
  prazoEntregaDesejado: new Date("2026-12-11T03:59:59.999Z"),
  etapa: "cotacoes",
  origemAtendimento: "aquisicao",
  necessidadeValidadaEm: null,
  estoqueDecididoEm: null,
  estoqueDecididoPorId: null,
  cotacaoSelecionadaId: null,
  selecionouCotacaoId: null,
  cotacaoSelecionadaEm: null,
  aprovouId: null,
  aprovadoEm: null,
  formaPagamento: null,
  pagamentoObservacao: null,
  pagamentoRegistradoEm: null,
  pagamentoRegistradoPorId: null,
  recebimentoConfirmadoPorId: null,
  valorOrcado: new Prisma.Decimal("1000"),
  valorCotado: new Prisma.Decimal("1200.5"),
  valorFaturado: null,
  concluidoEm: null,
  recebidoEm: null,
  canceladoEm: null,
  canceladoPorId: null,
  motivoCancelamento: null,
  ordemDeServicoId: null,
  createdAt: new Date("2026-11-20T12:00:00Z"),
  updatedAt: new Date("2026-11-20T12:00:00Z"),
  solicitante: { id: "00000000-0000-4000-8000-000000000001", name: "Ana" },
  responsavel: null,
  obra: null,
  // Vence hoje (25/11, fim do dia em Manaus).
  etapas: [{ entrouEm: new Date("2026-11-18T12:00:00Z"), prazoEm: new Date("2026-11-26T03:59:59.999Z") }],
  _count: { cotacoes: 2 },
  ...dados,
});

const CLIENTES = new Map([["00000000-0000-4000-8000-000000000601", "Hotel Rio Negro"]]);

describe("paraResumo", () => {
  it("usa o valor mais avançado (faturado, cotado, orçado), o nome do cliente e o prazo da passagem aberta", () => {
    const resumo = paraResumo(linha(), CLIENTES, AGORA);
    expect(resumo).toMatchObject({
      empresa: "waze",
      numero: 131,
      valor: "1200.50",
      destino: { tipo: "cliente", cliente: { nome: "Hotel Rio Negro" } },
      prazoEntregaDesejado: "2026-12-10",
      situacaoDoPrazo: "vence_hoje",
      cotacoes: 2,
    });
  });

  it("pedido cancelado não tem prazo de etapa", () => {
    const resumo = paraResumo(linha({ canceladoEm: AGORA, motivoCancelamento: "x" }), CLIENTES, AGORA);
    expect(resumo).toMatchObject({ situacao: "cancelado", situacaoDoPrazo: null, prazoDaEtapaEm: null });
  });
});

describe("montarQuadro", () => {
  const resumo = (dados: Partial<PedidoDeCompraResumo>) => ({ ...paraResumo(linha(), CLIENTES, AGORA), ...dados });

  it("uma coluna por etapa, na ordem do fluxo, com total, vencidos e que vencem hoje; cancelados ficam fora", () => {
    const quadro = montarQuadro([
      resumo({ etapa: "cotacoes", valor: "100.10", situacaoDoPrazo: "vencido" }),
      resumo({ etapa: "cotacoes", valor: null, situacaoDoPrazo: "vence_hoje" }),
      resumo({ etapa: "retirada", valor: "50.00", situacaoDoPrazo: "no_prazo" }),
      resumo({ etapa: "cotacoes", situacao: "cancelado", valor: "999.00" }),
    ]);
    expect(quadro.colunas.map((coluna) => coluna.etapa)).toEqual([
      "pedido_gerado", "analise_estoque", "cotacoes", "aprovacao_compra", "pagamento", "retirada", "concluido",
    ]);
    expect(quadro.colunas[2]).toMatchObject({ quantidade: 2, valorTotal: "100.10", vencidos: 1, vencemHoje: 1 });
    expect(quadro.colunas[5]).toMatchObject({ quantidade: 1, valorTotal: "50.00" });
    expect(quadro.colunas[0]).toMatchObject({ quantidade: 0, valorTotal: "0.00", pedidos: [] });
  });
});
