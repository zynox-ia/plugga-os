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
    const rawToken =
      request.signedCookies?.[SESSION_COOKIE_NAME] ?? request.cookies?.[SESSION_COOKIE_NAME];

    if (!rawToken) {
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
