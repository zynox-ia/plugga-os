export type HealthCheck = {
  status: "ok";
  service: string;
  timestamp: string;
};

/**
 * Server-side only: calls the real GET /health contract from apps/api.
 * Never called from the browser, so it needs no CORS handling on the API.
 */
export async function fetchHealth(): Promise<HealthCheck | null> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  try {
    const response = await fetch(`${baseUrl}/health`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as HealthCheck;
  } catch {
    return null;
  }
}
