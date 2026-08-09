import type { AuthPrincipal } from "./auth.types";

export interface SessionLookupContext {
  now: Date;
}

/**
 * Read-side of the session store used by SessionAuthContext. Kept separate from
 * the auth feature's write repository so the core seam depends only on this
 * narrow lookup. Implementations validate expiry and user status, apply sliding
 * renewal, and return the resolved principal (or null when the session is
 * missing, expired, or the user is inactive).
 */
export abstract class SessionLookupRepository {
  abstract resolvePrincipal(
    tokenHash: string,
    context: SessionLookupContext,
  ): Promise<AuthPrincipal | null>;
}
