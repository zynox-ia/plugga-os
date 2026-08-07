"use client";

/**
 * Browser-side mutation calls for the Comercial screens. These hit this
 * app's own /api/commercial/* route handlers (app/api/commercial/**),
 * never apps/api directly — the API only binds to the internal network
 * (see apps/web/app/lib/commercial-proxy.ts).
 */

export type CommercialResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function post<T>(path: string, body: unknown): Promise<CommercialResult<T>> {
  try {
    const response = await fetch(`/api/commercial/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const issues = Array.isArray(payload?.issues)
        ? payload.issues.map((issue: { message: string }) => issue.message).join("; ")
        : null;
      return { ok: false, message: issues || payload?.message || `falha (${response.status})` };
    }
    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, message: "não foi possível falar com o serviço comercial agora" };
  }
}

export function createOpportunity(input: unknown) {
  return post("opportunities", input);
}

export function updateOpportunityStage(id: string, input: unknown) {
  return post(`opportunities/${id}/stage`, input);
}

export function registerOpportunityContact(id: string, input: unknown) {
  return post(`opportunities/${id}/contacts`, input);
}

export function winOpportunity(id: string, input: unknown) {
  return post(`opportunities/${id}/win`, input);
}

export function loseOpportunity(id: string, input: unknown) {
  return post(`opportunities/${id}/lose`, input);
}

export function revisitOpportunity(id: string, input: unknown) {
  return post(`opportunities/${id}/revisit`, input);
}

export function createContract(input: unknown) {
  return post("contracts", input);
}

export function updateContractStatus(id: string, input: unknown) {
  return post(`contracts/${id}/status`, input);
}
