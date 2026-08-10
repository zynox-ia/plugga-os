import { headers } from "next/headers";

import type {
  AuditDetail,
  ClientFicha,
  ContestationDetail,
  ContractDetail,
  ContractList,
  CycleDetail,
  EnergyStudyDetail,
  CycleReportsResponse,
  EmailStatus,
  ListAuditsResponse,
  ListClientsResponse,
  ListConsumerUnitsResponse,
  ListContestationsResponse,
  ListCyclesResponse,
  ListEnergyStudiesResponse,
  ListIntegrationsResponse,
  ListJobRunsResponse,
  ListMarketMigrationsResponse,
  FornecedorLista,
  ObraLista,
  PedidoDetalhe,
  PedidoLista,
  ScorecardCompras,
  DiagnosticoCompras,
  OpportunityDetail,
  OpportunityList,
} from "@plugga/shared";

import { apiBaseUrl } from "./env";

export type HealthCheck = {
  status: "ok";
  service: string;
  timestamp: string;
};

const FETCH_TIMEOUT_MS = 3_000;

/**
 * As leituras do estudo passam pelo mesmo banco, mas o ambiente de
 * desenvolvimento alcança o Postgres por túnel SSH até a VPS: cada consulta
 * paga a latência da rede, e uma sessão validada leva ~2 s. O limite de 3 s,
 * pensado para banco local, derruba a página com "API indisponível" mesmo com
 * tudo funcionando. Enquanto não houver banco de desenvolvimento próprio, estas
 * chamadas usam um limite maior.
 */
const FETCH_TIMEOUT_TUNEL_MS = 15_000;

/**
 * Every route these fetchers are used from is already gated behind a real
 * session by middleware.ts (ADR-0008), so the incoming request always carries
 * a valid session cookie by the time a Server Component runs. Forwarding it
 * (rather than a synthetic dev-auth principal, which only resolves when
 * DEV_AUTH_ENABLED=true and is forbidden in production) is what makes these
 * calls actually authenticate in a real deployment — without it they 401 and
 * silently fall back to mock data forever.
 */
async function sessionCookieHeaders(): Promise<HeadersInit> {
  const incoming = await headers();
  const cookie = incoming.get("cookie");
  return cookie ? { cookie } : {};
}

/**
 * Server-side only: calls the real GET /health contract from apps/api.
 * Never called from the browser, so it needs no CORS handling on the API.
 */
export async function fetchHealth(): Promise<HealthCheck | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as HealthCheck;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /integrations contract (read-only, no credentials). */
export async function fetchIntegrations(): Promise<ListIntegrationsResponse | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/integrations`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as ListIntegrationsResponse;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /jobs contract (inventory-only). */
export async function fetchJobs(): Promise<ListJobRunsResponse | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/jobs`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as ListJobRunsResponse;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /email/status contract (no secrets). */
export async function fetchEmailStatus(): Promise<EmailStatus | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/email/status`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as EmailStatus;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /clientes contract (search/filter). */
export async function fetchClients(query: { q?: string; segment?: string; active?: string }): Promise<ListClientsResponse | null> {
  try {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.segment) params.set("segment", query.segment);
    if (query.active) params.set("active", query.active);
    const search = params.toString();

    const response = await fetch(`${apiBaseUrl()}/clientes${search ? `?${search}` : ""}`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as ListClientsResponse;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /clientes/:id/ficha aggregator contract. */
export async function fetchClientFicha(id: string): Promise<ClientFicha | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/clientes/${id}/ficha`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as ClientFicha;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /commercial/opportunities contract. */
export async function fetchOpportunities(): Promise<OpportunityList | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/commercial/opportunities`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as OpportunityList;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /commercial/opportunities/:id contract. */
export async function fetchOpportunity(id: string): Promise<OpportunityDetail | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/commercial/opportunities/${id}`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as OpportunityDetail;
  } catch {
    return null;
  }
}

/**
 * Server-side only: calls the real GET /energy/market-migrations contract.
 * There is no GET /energy/market-migrations/:id endpoint in this ticket's
 * scope (foundation + this flow only shipped the list read); the detail
 * screen resolves a single migration by filtering this list server-side.
 */
export async function fetchMarketMigrations(): Promise<ListMarketMigrationsResponse | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/energy/market-migrations`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as ListMarketMigrationsResponse;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /commercial/contracts contract. */
export async function fetchContracts(): Promise<ContractList | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/commercial/contracts`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as ContractList;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /commercial/contracts/:id contract. */
export async function fetchContract(id: string): Promise<ContractDetail | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/commercial/contracts/${id}`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as ContractDetail;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /energy/audits contract. */
export async function fetchAudits(): Promise<ListAuditsResponse | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/energy/audits`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as ListAuditsResponse;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /energy/audits/:id contract. */
export async function fetchAudit(id: string): Promise<AuditDetail | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/energy/audits/${id}`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as AuditDetail;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /energy/contestations contract. */
export async function fetchContestations(): Promise<ListContestationsResponse | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/energy/contestations`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as ListContestationsResponse;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /energy/contestations/:id contract. */
export async function fetchContestation(id: string): Promise<ContestationDetail | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/energy/contestations/${id}`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as ContestationDetail;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /energy/cycles contract. */
export async function fetchCycles(): Promise<ListCyclesResponse | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/energy/cycles`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as ListCyclesResponse;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /energy/cycles/:id contract. */
export async function fetchCycle(id: string): Promise<CycleDetail | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/energy/cycles/${id}`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as CycleDetail;
  } catch {
    return null;
  }
}

/** Server-side only: calls the real GET /energy/reports contract. */
export async function fetchCycleReports(): Promise<CycleReportsResponse | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/energy/reports`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as CycleReportsResponse;
  } catch {
    return null;
  }
}

/** Server-side only: GET /energy/consumer-units — usado no seletor de UC. */
export async function fetchConsumerUnits(): Promise<ListConsumerUnitsResponse | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/energy/consumer-units`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_TUNEL_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as ListConsumerUnitsResponse;
  } catch {
    return null;
  }
}

/** Server-side only: GET /energy-efficiency/studies. */
export async function fetchEnergyStudies(): Promise<ListEnergyStudiesResponse | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/energy-efficiency/studies`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_TUNEL_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as ListEnergyStudiesResponse;
  } catch {
    return null;
  }
}

/** Server-side only: GET /energy-efficiency/studies/:id. */
export async function fetchEnergyStudy(id: string): Promise<EnergyStudyDetail | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/energy-efficiency/studies/${id}`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_TUNEL_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as EnergyStudyDetail;
  } catch {
    return null;
  }
}

/**
 * Leituras de Compras (POP-COMP-001). A empresa é obrigatória em todas: a API
 * prova o alcance antes de tocar em dado, e uma leitura sem empresa não teria
 * como ser autorizada.
 */
async function lerCompras<T>(caminho: string): Promise<T | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}${caminho}`, {
      cache: "no-store",
      headers: await sessionCookieHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_TUNEL_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Server-side only: GET /compras/pedidos. */
export function fetchPedidosDeCompra(companyId: string): Promise<PedidoLista | null> {
  return lerCompras<PedidoLista>(`/compras/pedidos?companyId=${companyId}`);
}

/** Server-side only: GET /compras/pedidos/:id. */
export function fetchPedidoDeCompra(id: string, companyId: string): Promise<PedidoDetalhe | null> {
  return lerCompras<PedidoDetalhe>(`/compras/pedidos/${id}?companyId=${companyId}`);
}

/** Server-side only: GET /compras/scorecard. */
export function fetchScorecardCompras(
  companyId: string,
  de: string,
  ate: string,
): Promise<ScorecardCompras | null> {
  return lerCompras<ScorecardCompras>(`/compras/scorecard?companyId=${companyId}&de=${de}&ate=${ate}`);
}

/** Server-side only: GET /compras/diagnostico. */
export function fetchDiagnosticoCompras(
  companyId: string,
  de: string,
  ate: string,
): Promise<DiagnosticoCompras | null> {
  return lerCompras<DiagnosticoCompras>(`/compras/diagnostico?companyId=${companyId}&de=${de}&ate=${ate}`);
}

/** Server-side only: GET /compras/fornecedores. */
export function fetchFornecedores(companyId: string): Promise<FornecedorLista | null> {
  return lerCompras<FornecedorLista>(`/compras/fornecedores?companyId=${companyId}`);
}

/** Server-side only: GET /compras/obras. */
export function fetchObrasDeCompra(companyId: string): Promise<ObraLista | null> {
  return lerCompras<ObraLista>(`/compras/obras?companyId=${companyId}`);
}
