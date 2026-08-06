import { AuthContext, type AuthenticatedRequest, type AuthPrincipal } from "./auth.types";

/**
 * Tries each context in order, returning the first resolved principal. Used
 * only when DEV_AUTH_ENABLED is true so the local dev-header escape hatch can
 * coexist with real session auth (e.g. e2e). Never wired outside dev because
 * DEV_AUTH_ENABLED is false by default and forbidden in production.
 */
export class CompositeAuthContext extends AuthContext {
  constructor(private readonly contexts: readonly AuthContext[]) {
    super();
  }

  async resolve(request: AuthenticatedRequest): Promise<AuthPrincipal | null> {
    for (const context of this.contexts) {
      const principal = await context.resolve(request);
      if (principal) {
        return principal;
      }
    }
    return null;
  }
}
