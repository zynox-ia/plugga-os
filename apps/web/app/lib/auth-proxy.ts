import { NextResponse } from "next/server";

import { apiBaseUrl } from "./env";

const FETCH_TIMEOUT_MS = 5_000;

/**
 * CSRF defense in depth for our own cookie-bearing proxy routes, mirroring the
 * API's OriginCheckGuard (apps/api/src/auth/origin-check.guard.ts) rather than
 * comparing against this request's own URL: Next.js can report a canonicalized
 * host (e.g. "localhost") that differs from the literal host a browser used
 * (e.g. "127.0.0.1"), so a same-origin check against request.url would reject
 * legitimate same-origin requests. Browsers always send Origin on cross-site
 * fetches; same-origin page navigations/form posts and server-to-server calls
 * (curl, tests) omit it, so absence is allowed.
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
 * The API listens on 127.0.0.1 (see README) and trusts only that loopback hop
 * for X-Forwarded-For (apps/api/src/main.ts, `trust proxy: "loopback"`), so
 * its per-IP rate limiting relies entirely on this app forwarding the real
 * client address here. In production this app must itself sit behind a
 * reverse proxy that sets (overwrites, never appends to) X-Forwarded-For from
 * the actual TCP peer — never a client-supplied value. Passed through as-is
 * (not re-derived), since App Router route handlers have no API to read the
 * raw socket address without a custom server.
 */
function clientForwardedFor(request: Request): string | null {
  return request.headers.get("x-forwarded-for");
}

/**
 * Forwards a request to the real POST /auth/* endpoint on apps/api, carrying the
 * browser's session cookie to the API and relaying any Set-Cookie back to the
 * browser under this app's own origin. This keeps the session cookie same-origin
 * from the browser's point of view (no CORS/credentialed-fetch setup needed on
 * the API) while the API remains the sole source of truth for the session.
 */
export async function proxyAuthPost(request: Request, apiPath: string): Promise<NextResponse> {
  if (!isOriginAllowed(request)) {
    return NextResponse.json({ message: "origin not allowed" }, { status: 403 });
  }

  // Some routes (logout) have no body; others require a JSON object.
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
    upstream = await fetch(`${apiBaseUrl()}/auth/${apiPath}`, {
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
    return NextResponse.json({ message: "auth service unavailable" }, { status: 503 });
  }

  return relayUpstream(upstream);
}

/** Forwards a request to a GET /auth/* endpoint, carrying the session cookie only. */
export async function proxyAuthGet(request: Request, apiPath: string): Promise<NextResponse> {
  const cookie = request.headers.get("cookie");

  let upstream: Response;
  try {
    upstream = await fetch(`${apiBaseUrl()}/auth/${apiPath}`, {
      method: "GET",
      headers: cookie ? { cookie } : {},
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ message: "auth service unavailable" }, { status: 503 });
  }

  return relayUpstream(upstream);
}

async function relayUpstream(upstream: Response): Promise<NextResponse> {
  const text = await upstream.text();
  const response = new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });

  for (const setCookie of upstream.headers.getSetCookie()) {
    response.headers.append("set-cookie", setCookie);
  }

  return response;
}
