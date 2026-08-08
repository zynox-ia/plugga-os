/**
 * The API's per-IP rate limiting depends on what this app forwards, because
 * App Router route handlers cannot read the raw socket address without a custom
 * server — the value can only be relayed, never re-derived.
 *
 * That makes forwarding safe only when a reverse proxy in front of THIS app
 * overwrites (never appends to) X-Forwarded-For from the real TCP peer. Without
 * one, the header is client-controlled and relaying it would let an attacker
 * rotate it to dodge both the throttle and the lockout. So it is opt-in via
 * WEB_TRUST_PROXY and validated before being passed on (ADR-0012 / R1b).
 *
 * The API side must agree: its TRUST_PROXY has to trust the hop this app
 * represents, or the forwarded value is ignored anyway
 * (apps/api/src/configure-app.ts).
 */
export function clientForwardedFor(request: Request): string | null {
  // Fail closed: off by default, the API buckets everyone under this app's
  // address — degraded rate limiting rather than a bypass. The email-scoped
  // lockout is the defense that survives either topology.
  if (!trustsProxy()) {
    return null;
  }

  const raw = request.headers.get("x-forwarded-for");
  if (!raw) {
    return null;
  }

  // Only a single, well-formed address is forwarded. A multi-hop chain means
  // more hops than we can vouch for, so it is dropped rather than relayed raw.
  const value = raw.trim();
  if (value.includes(",") || !isIpAddress(value)) {
    return null;
  }
  return value;
}

function trustsProxy(): boolean {
  return (process.env.WEB_TRUST_PROXY ?? "false").trim().toLowerCase() === "true";
}

/** Accepts a bare IPv4/IPv6 literal — no ports, no chains, no hostnames. */
export function isIpAddress(value: string): boolean {
  if (value.includes(":")) {
    return URL.canParse(`http://[${value}]`);
  }
  const parts = value.split(".");
  return parts.length === 4 && parts.every(isOctet);
}

function isOctet(part: string): boolean {
  const octet = Number(part);
  return Number.isInteger(octet) && octet >= 0 && octet <= 255 && String(octet) === part;
}
