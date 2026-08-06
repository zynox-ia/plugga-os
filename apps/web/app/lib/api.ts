import type { ListIntegrationsResponse, ListJobRunsResponse } from "@plugga/shared";

import { apiBaseUrl } from "./env";

export type HealthCheck = {
  status: "ok";
  service: string;
  timestamp: string;
};

const FETCH_TIMEOUT_MS = 3_000;

/**
 * Synthetic dev-auth principal (see apps/api DevHeaderAuthContext). Only
 * works locally with DEV_AUTH_ENABLED=true; never a real auth mechanism.
 * These endpoints require a resolved principal but no specific role.
 *
 * No "service:" prefix: that would resolve to kind "service" (an agent
 * identity), which must stay reserved for real agent actions so it never
 * gets reused as the attributed actor on a future mutating call.
 */
const DEV_AUTH_HEADERS = {
  "x-dev-principal": "web-shell",
  "x-dev-roles": "viewer",
};

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
      headers: DEV_AUTH_HEADERS,
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
      headers: DEV_AUTH_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as ListJobRunsResponse;
  } catch {
    return null;
  }
}
