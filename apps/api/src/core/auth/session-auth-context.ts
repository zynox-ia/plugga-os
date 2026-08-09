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
    // Só o cookie assinado vale. O Set-Cookie sempre sai com `signed: true` e o
    // logout também só lê `signedCookies`; aceitar o não assinado aqui tornaria
    // a assinatura HMAC decorativa — quem tivesse o token bruto autenticaria
    // sem conhecer AUTH_SESSION_SECRET, e o logout não revogaria essa sessão.
    const rawToken = request.signedCookies?.[SESSION_COOKIE_NAME];

    if (!rawToken) {
      return null;
    }

    return this.sessions.resolvePrincipal(hashToken(rawToken), { now: new Date() });
  }
}
