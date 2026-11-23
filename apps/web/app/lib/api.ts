import {
  type DealStatus,
  clientDetailSchema,
  clientOwnersResponseSchema,
  contractDetailSchema,
  contractListSchema,
  emailStatusSchema,
  fornecedorSchema,
  itemDeEstoqueSchema,
  listarItensDeEstoqueRespostaSchema,
  listarMovimentacoesRespostaSchema,
  listarPedidosDeCompraRespostaSchema,
  opcoesDeCompraRespostaSchema,
  pedidoDeCompraSchema,
  quadroDeComprasRespostaSchema,
  listarFornecedoresRespostaSchema,
  listClientsResponseSchema,
  listDealsResponseSchema,
  listIntegrationsResponseSchema,
  listJobRunsResponseSchema,
  listaDaEquipeSchema,
  listPipelinesResponseSchema,
  opportunityDetailSchema,
  opportunityListSchema,
} from "@plugga/shared";

import { lerApi, type ResultadoApi } from "./api-client";
import type { EsquemaDeResposta } from "./api-core";

/**
 * Leituras do servidor para as telas (US12). Todas passam pelo cliente único
 * (`api-client.ts`): cookie, `X-Forwarded-For` e `Origin` repassados, tempo
 * máximo único, identificadores validados como UUID antes da chamada e resposta
 * validada com o schema de `@plugga/shared`.
 *
 * Cada função devolve `ResultadoApi`: a tela decide o que mostrar para
 * não autenticado, proibido, não encontrado e indisponível (T126). Antes, tudo
 * isso virava `null` e a página caía em dado de exemplo sem avisar.
 */

export type HealthCheck = {
  status: "ok";
  service: string;
  timestamp: string;
};

const healthSchema: EsquemaDeResposta<HealthCheck> = {
  safeParse: (valor: unknown) =>
    typeof valor === "object" &&
    valor !== null &&
    (valor as { status?: unknown }).status === "ok" &&
    typeof (valor as { service?: unknown }).service === "string" &&
    typeof (valor as { timestamp?: unknown }).timestamp === "string"
      ? { success: true as const, data: valor as HealthCheck }
      : { success: false as const },
};

/** GET /health (contrato da API). Nunca chamada do navegador. */
export const fetchHealth = (): Promise<ResultadoApi<HealthCheck>> => lerApi("/health", healthSchema);

export const fetchIntegrations = () => lerApi("/integrations", listIntegrationsResponseSchema);

export const fetchJobs = () => lerApi("/jobs", listJobRunsResponseSchema);

export const fetchEmailStatus = () => lerApi("/email/status", emailStatusSchema);

/** GET /clientes (busca/filtro). CPF e telefone já chegam mascarados. */
/** GET /equipe: lista e escopo de quem pede (Configurações › Equipe). */
export const fetchEquipe = () => lerApi("/equipe", listaDaEquipeSchema);

export const fetchClients = (query: { q?: string; active?: string }) =>
  lerApi("/clientes", listClientsResponseSchema, {}, { consulta: query });

/** GET /clientes/:id: ficha completa do cliente, com contatos. */
export const fetchClient = (id: string) => lerApi("/clientes/:id", clientDetailSchema, { id });

/** GET /clientes/responsaveis: quem pode ser responsável por um cliente. */
export const fetchClientOwners = () => lerApi("/clientes/responsaveis", clientOwnersResponseSchema);

/** GET /suprimentos/fornecedores: cadastro único de fornecedores, com a contagem por situação. */
export const fetchFornecedores = (query: { busca?: string; situacao: string; categoria?: string }) =>
  lerApi("/suprimentos/fornecedores", listarFornecedoresRespostaSchema, {}, { consulta: query });

/** GET /suprimentos/fornecedores/:id: ficha completa, para editar. */
export const fetchFornecedor = (id: string) => lerApi("/suprimentos/fornecedores/:id", fornecedorSchema, { id });

type ConsultaDeCompras = Record<string, string | undefined>;

/** GET /suprimentos/compras/quadro: uma coluna por etapa, com contagem, soma e prazos. */
export const fetchQuadroDeCompras = (consulta: ConsultaDeCompras) =>
  lerApi("/suprimentos/compras/quadro", quadroDeComprasRespostaSchema, {}, { consulta });

/** GET /suprimentos/compras/pedidos: lista (até 200, os mais recentes), com total. */
export const fetchPedidosDeCompra = (consulta: ConsultaDeCompras) =>
  lerApi("/suprimentos/compras/pedidos", listarPedidosDeCompraRespostaSchema, {}, { consulta });

/** GET /suprimentos/compras/pedidos/:id: a ficha, com as ações que a pessoa pode fazer agora. */
export const fetchPedidoDeCompra = (id: string) => lerApi("/suprimentos/compras/pedidos/:id", pedidoDeCompraSchema, { id });

/** GET /suprimentos/compras/opcoes: pessoas, obras e fornecedores ativos. */
export const fetchOpcoesDeCompra = () => lerApi("/suprimentos/compras/opcoes", opcoesDeCompraRespostaSchema);

/** GET /pipelines: os pipelines que a pessoa alcança, com etapas, equipe e se pode configurá-los. */
export const fetchPipelinesAtivos = () =>
  lerApi("/pipelines", listPipelinesResponseSchema, {}, { consulta: { status: "active" } });

/** GET /leads: os negócios de um pipeline, em qualquer situação (o quadro e a lista filtram). */
export const fetchDeals = (pipelineId: string, status: DealStatus | "all" = "all") =>
  lerApi("/leads", listDealsResponseSchema, {}, { consulta: { pipelineId, status } });

export const fetchOpportunities = () => lerApi("/commercial/opportunities", opportunityListSchema);

export const fetchOpportunity = (id: string) =>
  lerApi("/commercial/opportunities/:id", opportunityDetailSchema, { id });

export const fetchContracts = () => lerApi("/commercial/contracts", contractListSchema);

export const fetchContract = (id: string) => lerApi("/commercial/contracts/:id", contractDetailSchema, { id });

type ConsultaDeEstoque = Record<string, string | undefined>;

/** GET /suprimentos/estoque/itens: itens com o saldo e o resumo (PLU-332). */
export const fetchItensDeEstoque = (consulta: ConsultaDeEstoque = {}) =>
  lerApi("/suprimentos/estoque/itens", listarItensDeEstoqueRespostaSchema, {}, { consulta });

/** GET /suprimentos/estoque/itens/:id: a ficha, com reservas, 8 semanas e últimas movimentações. */
export const fetchItemDeEstoque = (id: string) => lerApi("/suprimentos/estoque/itens/:id", itemDeEstoqueSchema, { id });

/** GET /suprimentos/estoque/movimentacoes: agrupadas por dia, com o resumo do período. */
export const fetchMovimentacoesDeEstoque = (consulta: ConsultaDeEstoque) =>
  lerApi("/suprimentos/estoque/movimentacoes", listarMovimentacoesRespostaSchema, {}, { consulta });
