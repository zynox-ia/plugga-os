"use client";

/**
 * Browser-side mutation calls for the Energia & OPM screens. These hit this
 * app's own /api/energy/* route handlers (app/api/energy/**), never apps/api
 * directly — the API only binds to the internal network (see
 * apps/web/app/lib/energy-proxy.ts).
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

export function createMarketMigration(input: unknown) {
  return post("market-migrations", input);
}

export function advanceMarketMigrationStage(id: string, input: unknown) {
  return post(`market-migrations/${id}/stage`, input);
}

export function cancelMarketMigration(id: string, input: unknown) {
  return post(`market-migrations/${id}/cancel`, input);
}

export function activateMarketMigration(id: string, input: unknown) {
  return post(`market-migrations/${id}/activate`, input);
}
