/** Server-side base URL for the Plugga OS API. Never bundled into client JS on its own. */
export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
}
