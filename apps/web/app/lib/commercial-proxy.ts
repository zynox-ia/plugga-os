import { NextResponse } from "next/server";

import { apiBaseUrl } from "./env";
import { clientForwardedFor } from "./forwarded-for";

const FETCH_TIMEOUT_MS = 5_000;

/**
 * CSRF defense in depth for our own cookie-bearing proxy routes, mirroring
 * the API's OriginCheckGuard and this app's own lib/auth-proxy.ts (kept as a
 * separate copy rather than a shared import: auth is foundation-owned and
 * this module intentionally has no dependency on it).
 */
function isOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const configured = (process.env.AUTH_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (configured.length > 0) return configured.includes(origin);

  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Forwards a client-side mutation to POST /commercial/* on apps/api. The API
 * only binds to the internal Docker/loopback network, so the browser can
 * never call it directly (apps/api/src/main.ts) — every write from a
 * "use client" screen has to be relayed through a same-origin Next.js route
 * handler like this one, carrying the session cookie.
 */
export async function proxyCommercialPost(request: Request, apiPath: string): Promise<NextResponse> {
  if (!isOriginAllowed(request)) {
    return NextResponse.json({ message: "origin not allowed" }, { status: 403 });
  }

  const rawBody = await request.text();
  if (rawBody.length > 0) {
    try {
      JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ message: "request body must be valid JSON" }, { status: 400 });
    }
  }

  const cookie = request.headers.get("cookie");
  const forwardedFor = clientForwardedFor(request);

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/commercial/${apiPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}),
      },
      body: rawBody.length > 0 ? rawBody : "{}",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "commercial service unavailable" }, { status: 503 });
  }

  return relayUpstream(upstream);
}

async function relayUpstream(upstream: Response): Promise<NextResponse> {
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
