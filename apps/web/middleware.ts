import { NextResponse, type NextRequest } from "next/server";

import { apiBaseUrl } from "./app/lib/env";

const FETCH_TIMEOUT_MS = 5_000;

const PUBLIC_PATHS = ["/login", "/auth/accept-invite", "/auth/reset"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path);
}

/**
 * Builds a same-origin redirect target. request.nextUrl can report a
 * canonicalized host (e.g. "localhost") that differs from the literal Host
 * header the browser actually used (e.g. "127.0.0.1" or a real domain behind
 * a proxy); redirecting to the wrong host would silently drop the session
 * cookie, since cookies are scoped per-hostname. The incoming Host header
 * (or X-Forwarded-Host behind a reverse proxy) is what the browser trusts.
 */
function redirectTo(request: NextRequest, pathname: string): URL {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  // request.nextUrl canonicalizes loopback hostnames (127.0.0.1 -> localhost),
  // which would otherwise make this an unwanted cross-host redirect and drop
  // the session cookie. Prefer the actual incoming Host header instead.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) url.host = host;
  return url;
}

/** True when apps/api's session cookie is accepted by GET /auth/me. */
async function hasValidSession(request: NextRequest): Promise<boolean> {
  const cookie = request.headers.get("cookie");
  if (!cookie) return false;

  try {
    const response = await fetch(`${apiBaseUrl()}/auth/me`, {
      headers: { cookie },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Gates every app route behind a real session (ADR-0008), replacing the former
 * dev-header stub as the default path. /login and the token-based invite/reset
 * pages stay public so a signed-out visitor can always reach them.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const authenticated = await hasValidSession(request);

  if (isPublicPath(pathname)) {
    if (pathname === "/login" && authenticated) {
      return NextResponse.redirect(redirectTo(request, "/"));
    }
    return NextResponse.next();
  }

  if (!authenticated) {
    const loginUrl = redirectTo(request, "/login");
    if (pathname !== "/") loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|api|brand|fonts|favicon.ico).*)"],
};
