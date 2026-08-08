import { Inject, Injectable } from "@nestjs/common";

import { AuthContext, type AuthenticatedRequest, type AuthPrincipal } from "./auth.types";
import { SessionLookupRepository } from "./session-lookup.repository";
import { hashToken, SESSION_COOKIE_NAME } from "./token.util";

/**
 * Default (production) AuthContext. Resolves the opaque session cookie to a
 * principal via the session store. No cookie means no principal — never a
 * database hit.
 */
@Injectable()
export class SessionAuthContext extends AuthContext {
  constructor(
    @Inject(SessionLookupRepository)
    private readonly sessions: SessionLookupRepository,
  ) {
    super();
  }

  async resolve(request: AuthenticatedRequest): Promise<AuthPrincipal | null> {
    // Signed cookies only. The session cookie is always issued with
    // `signed: true` (AuthController.cookieOptions), so falling back to the
    // unsigned jar would let a caller strip the signature off and have the bare
    // value accepted — which makes AUTH_SESSION_SECRET decorative rather than a
    // defense. cookie-parser puts a present-but-invalid signature here as
    // `false`, which this rejects too.
    const rawToken = request.signedCookies?.[SESSION_COOKIE_NAME];

    if (!rawToken || typeof rawToken !== "string") {
      return null;
    }

    const userAgent = request.headers["user-agent"];

    return this.sessions.resolvePrincipal(hashToken(rawToken), {
      now: new Date(),
      ip: request.ip,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    });
  }
}
