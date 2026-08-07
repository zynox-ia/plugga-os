"use client";

/**
 * Browser-side mutation calls for the Energia & OPM screens. These hit this
 * app's own /api/energy/* route handlers (app/api/energy/**), never apps/api
 * directly — mirrors lib/commercial-client.ts.
 */

export type EnergyResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function post<T>(path: string, body: unknown): Promise<EnergyResult<T>> {
  try {
    const response = await fetch(`/api/energy/${path}`, {
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
    return { ok: false, message: "não foi possível falar com o serviço de energia agora" };
  }
}

export function createAudit(input: unknown) {
  return post("audits", input);
}

export function resolveAudit(id: string, input: unknown) {
  return post(`audits/${id}/resolve`, input);
}

export function createContestation(input: unknown) {
  return post("contestations", input);
}

export function updateContestationStatus(id: string, input: unknown) {
  return post(`contestations/${id}/status`, input);
}
