import {
  auditDetailSchema,
  clientDetailSchema,
  clientOwnersResponseSchema,
  contestationDetailSchema,
  contractDetailSchema,
  contractListSchema,
  cycleDetailSchema,
  cycleReportsResponseSchema,
  diagnosticoComprasSchema,
  emailStatusSchema,
  fornecedorListaSchema,
  listAuditsResponseSchema,
  listClientsResponseSchema,
  listConsumerUnitsResponseSchema,
  listContestationsResponseSchema,
  listCyclesResponseSchema,
  listDealsResponseSchema,
  listIntegrationsResponseSchema,
  listJobRunsResponseSchema,
  listMarketMigrationsResponseSchema,
  listPipelinesResponseSchema,
  obraListaSchema,
  opportunityDetailSchema,
  opportunityListSchema,
  pedidoDetalheSchema,
  pedidoListaSchema,
  scorecardComprasSchema,
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
export const fetchClients = (query: { q?: string; active?: string }) =>
  lerApi("/clientes", listClientsResponseSchema, {}, { consulta: query });

/** GET /clientes/:id: ficha completa do cliente, com contatos. */
export const fetchClient = (id: string) => lerApi("/clientes/:id", clientDetailSchema, { id });

/** GET /clientes/responsaveis: quem pode ser responsável por um cliente. */
export const fetchClientOwners = () => lerApi("/clientes/responsaveis", clientOwnersResponseSchema);

/** GET /pipelines: os pipelines que a pessoa alcança, com etapas, equipe e se pode configurá-los. */
export const fetchPipelines = () => lerApi("/pipelines", listPipelinesResponseSchema);

/** GET /negocios: os negócios de um pipeline, em qualquer situação (o quadro e a lista filtram). */
export const fetchDeals = (pipelineId: string) => lerApi("/negocios", listDealsResponseSchema, {}, { consulta: { pipelineId, status: "all" } });

export const fetchOpportunities = () => lerApi("/commercial/opportunities", opportunityListSchema);

export const fetchOpportunity = (id: string) =>
  lerApi("/commercial/opportunities/:id", opportunityDetailSchema, { id });

/**
 * GET /energy/market-migrations. Não há GET por id nesse escopo; a tela de
 * detalhe resolve uma migração filtrando esta lista no servidor.
 */
export const fetchMarketMigrations = () => lerApi("/energy/market-migrations", listMarketMigrationsResponseSchema);

export const fetchContracts = () => lerApi("/commercial/contracts", contractListSchema);

export const fetchContract = (id: string) => lerApi("/commercial/contracts/:id", contractDetailSchema, { id });

export const fetchAudits = () => lerApi("/energy/audits", listAuditsResponseSchema);

export const fetchAudit = (id: string) => lerApi("/energy/audits/:id", auditDetailSchema, { id });

export const fetchContestations = () => lerApi("/energy/contestations", listContestationsResponseSchema);

export const fetchContestation = (id: string) =>
  lerApi("/energy/contestations/:id", contestationDetailSchema, { id });

export const fetchCycles = () => lerApi("/energy/cycles", listCyclesResponseSchema);

export const fetchCycle = (id: string) => lerApi("/energy/cycles/:id", cycleDetailSchema, { id });

export const fetchCycleReports = () => lerApi("/energy/reports", cycleReportsResponseSchema);

/** GET /energy/consumer-units — usado no seletor de UC. */
export const fetchConsumerUnits = () => lerApi("/energy/consumer-units", listConsumerUnitsResponseSchema);

/**
 * Leituras de Compras (POP-COMP-001). A empresa é obrigatória em todas: a API
 * prova o alcance antes de tocar em dado, e uma leitura sem empresa não teria
 * como ser autorizada.
 */
export const fetchPedidosDeCompra = (companyId: string) =>
  lerApi("/compras/pedidos", pedidoListaSchema, {}, { consulta: { companyId } });

export const fetchPedidoDeCompra = (id: string, companyId: string) =>
  lerApi("/compras/pedidos/:id", pedidoDetalheSchema, { id }, { consulta: { companyId } });

export const fetchScorecardCompras = (companyId: string, de: string, ate: string) =>
  lerApi("/compras/scorecard", scorecardComprasSchema, {}, { consulta: { companyId, de, ate } });

export const fetchDiagnosticoCompras = (companyId: string, de: string, ate: string) =>
  lerApi("/compras/diagnostico", diagnosticoComprasSchema, {}, { consulta: { companyId, de, ate } });

export const fetchFornecedores = (companyId: string) =>
  lerApi("/compras/fornecedores", fornecedorListaSchema, {}, { consulta: { companyId } });

export const fetchObrasDeCompra = (companyId: string) =>
  lerApi("/compras/obras", obraListaSchema, {}, { consulta: { companyId } });
