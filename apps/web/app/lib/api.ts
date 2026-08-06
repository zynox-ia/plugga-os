import type { ListIntegrationsResponse, ListJobRunsResponse } from "@plugga/shared";

export type HealthCheck = {
  status: "ok";
  service: string;
  timestamp: string;
};

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}

/**
 * Synthetic dev-auth principal (see apps/api DevHeaderAuthContext). Only
 * works locally with DEV_AUTH_ENABLED=true; never a real auth mechanism.
 * These endpoints require a resolved principal but no specific role.
 */
const DEV_AUTH_HEADERS = {
  "x-dev-principal": "service:web-shell",
  "x-dev-roles": "viewer",
};

/**
 * Server-side only: calls the real GET /health contract from apps/api.
 * Never called from the browser, so it needs no CORS handling on the API.
 */
export async function fetchHealth(): Promise<HealthCheck | null> {
  try {
    const response = await fetch(`${apiBaseUrl()}/health`, { cache: "no-store" });
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
      headers: DEV_AUTH_HEADERS,
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
      headers: DEV_AUTH_HEADERS,
    });
    if (!response.ok) return null;
    return (await response.json()) as ListJobRunsResponse;
  } catch {
    return null;
  }
}
