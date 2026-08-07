import { headers } from "next/headers";

import type { EmailStatus, ListIntegrationsResponse, ListJobRunsResponse } from "@plugga/shared";

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
