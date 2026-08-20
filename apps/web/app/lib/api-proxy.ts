import { NextResponse } from "next/server";

import { apiBaseUrl } from "./env";
import { clientForwardedFor } from "./forwarded-for";
import { isOriginAllowed } from "./origin-check";

const FETCH_TIMEOUT_MS = 5_000;

/**
 * Forwards a mutating request (POST/PATCH) to apps/api, carrying the browser's
 * session cookie server-side so the API never needs CORS/credentialed-fetch
 * support — the cookie stays same-origin from the browser's point of view.
 */
export async function proxyApiMutation(request: Request, method: "POST" | "PATCH", apiPath: string): Promise<NextResponse> {
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
    upstream = await fetch(`${apiBaseUrl()}${apiPath}`, {
      method,
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
    return NextResponse.json({ message: "API indisponível" }, { status: 503 });
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
