import type { RoleKey } from "@plugga/shared";

export interface AuthPrincipal {
  id: string;
  kind: "user" | "service";
  roles: RoleKey[];
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  authPrincipal?: AuthPrincipal;
}

export abstract class AuthContext {
  abstract resolve(request: AuthenticatedRequest): AuthPrincipal | null;
}
