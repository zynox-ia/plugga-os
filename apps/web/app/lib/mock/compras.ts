import type { PedidoResumo, ScorecardCompras } from "@plugga/shared";

/**
 * Fallback local, usado só quando GET /compras/* não responde. Materiais e
 * fornecedores ilustrativos, sem dado real — a tela avisa na hora que está
 * mostrando exemplo.
 */

const base = {
  companyId: "plugga" as const,
  origemAtendimento: null,
  obraId: null,
  clientId: null,
  clientNome: null,
  solicitanteId: "00000000-0000-4000-8000-000000009001",
  responsavelId: "00000000-0000-4000-8000-000000009002",
  responsavelNome: "Responsável de Compras",
  valorCotado: null,
  valorFaturado: null,
  concluidoEm: null,
  createdAt: "2026-08-03T13:00:00.000Z",
  updatedAt: "2026-08-05T13:00:00.000Z",
};

export const FALLBACK_PEDIDOS: PedidoResumo[] = [
  {
    ...base,
    id: "00000000-0000-4000-8000-000000001001",
    numero: 41,
    titulo: "Cabo 10mm e eletrodutos",
    etapa: "cotacoes",
    destino: "obra",
    obraNome: "Subestação Santa Tereza",
    solicitanteNome: "Engenharia de campo",
    prazoEntregaDesejado: "2026-08-25T13:00:00.000Z",
    valorOrcado: "5400.00",
    prazoEtapaEm: "2026-08-12T22:00:00.000Z",
    situacaoPrazo: "no_prazo",
  },
  {
    ...base,
    id: "00000000-0000-4000-8000-000000001002",
    numero: 42,
    titulo: "Disjuntores tripolares 63A",
    etapa: "aprovacao_compra",
    destino: "obra",
    obraNome: "Usina Jardim Floresta",
    solicitanteNome: "Engenharia de campo",
    prazoEntregaDesejado: "2026-08-20T13:00:00.000Z",
    valorOrcado: "2100.00",
    valorCotado: "2380.00",
    prazoEtapaEm: "2026-08-06T22:00:00.000Z",
    situacaoPrazo: "vencida",
  },
  {
    ...base,
    id: "00000000-0000-4000-8000-000000001003",
    numero: 43,
    titulo: "Material de escritório",
    etapa: "retirada",
    origemAtendimento: "estoque",
    destino: "interno",
    obraNome: null,
    solicitanteNome: "Administrativo",
    prazoEntregaDesejado: "2026-08-14T13:00:00.000Z",
    valorOrcado: "380.00",
    prazoEtapaEm: "2026-08-11T22:00:00.000Z",
    situacaoPrazo: "vence_hoje",
  },
];

export const FALLBACK_SCORECARD: ScorecardCompras = {
  companyId: "plugga",
  de: "2026-08-01T00:00:00.000Z",
  ate: "2026-08-31T23:59:59.000Z",
  assertividadeGlobal: {
    percentual: 92.4,
    farol: "amarelo",
    totalOrcado: "18400.00",
    totalFaturado: "17002.00",
    pedidosConsiderados: 6,
  },
  backlogCritico: {
    porExecutor: [
      {
        responsavelId: "00000000-0000-4000-8000-000000009002",
        responsavelNome: "Responsável de Compras",
        emitidas: 9,
        concluidas: 6,
        pendentesNoPrazo: 2,
        pendentesVencidas: 1,
        percentualBacklogCritico: 11.11,
      },
    ],
    total: {
      responsavelId: null,
      responsavelNome: null,
      emitidas: 9,
      concluidas: 6,
      pendentesNoPrazo: 2,
      pendentesVencidas: 1,
      percentualBacklogCritico: 11.11,
    },
  },
  cumprimentoSla: [
    { etapa: "pedido_gerado", concluidas: 9, noPrazo: 9, percentual: 100, farol: "verde" },
    { etapa: "analise_estoque", concluidas: 9, noPrazo: 8, percentual: 88.89, farol: "amarelo" },
    { etapa: "cotacoes", concluidas: 7, noPrazo: 5, percentual: 71.43, farol: "vermelho" },
    { etapa: "aprovacao_compra", concluidas: 7, noPrazo: 7, percentual: 100, farol: "verde" },
    { etapa: "pagamento", concluidas: 6, noPrazo: 6, percentual: 100, farol: "verde" },
    { etapa: "retirada", concluidas: 6, noPrazo: 6, percentual: 100, farol: "verde" },
  ],
  dispensasDeSegregacao: 0,
};
