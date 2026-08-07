import { headers } from "next/headers";

import type {
  AuditDetail,
  ClientFicha,
  ContestationDetail,
  ContractDetail,
  ContractList,
  EmailStatus,
  ListAuditsResponse,
  ListClientsResponse,
  ListContestationsResponse,
  ListIntegrationsResponse,
  ListJobRunsResponse,
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
