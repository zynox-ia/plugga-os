import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "plugga_session";

/**
 * Generates a high-entropy opaque token. The raw value is only ever shown once
 * (session cookie, invite/reset link); the database stores its hash.
 */
export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

/** Deterministic hash used to look up a token without storing the raw value. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
