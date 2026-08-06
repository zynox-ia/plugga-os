import type { RoleKey } from "@plugga/shared";

export interface AuthPrincipal {
  id: string;
  kind: "user" | "service";
  roles: RoleKey[];
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
  signedCookies?: Record<string, string | undefined>;
  ip?: string;
  authPrincipal?: AuthPrincipal;
}

export abstract class AuthContext {
  /**
   * Resolves the authenticated principal for a request, or null when none.
   * Async because the default (session) provider performs a database lookup.
   */
  abstract resolve(request: AuthenticatedRequest): Promise<AuthPrincipal | null>;
}
