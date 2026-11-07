import type { Acesso } from "@plugga/shared";

export interface AuthPrincipal {
  id: string;
  kind: "user" | "service";
  /** O que a pessoa alcança (`@Departamento`/`@Plataforma`). */
  acesso: Acesso;
}

export interface AuthenticatedRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string | undefined>;
  signedCookies?: Record<string, string | undefined>;
  ip?: string;
  authPrincipal?: AuthPrincipal;
  /** Capacidade interna validada pelo cookie assinado; nunca serializar ou registrar em logs. */
  databaseSessionHash?: string;
  /** Capacidade da identidade de IA validada; nunca serializar ou registrar. */
  databaseAgentHash?: string;
}

export abstract class AuthContext {
  /**
   * Resolves the authenticated principal for a request, or null when none.
   * Async because the default (session) provider performs a database lookup.
   */
  abstract resolve(request: AuthenticatedRequest): Promise<AuthPrincipal | null>;
}
