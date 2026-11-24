import type { CriacaoDeAgente } from "@plugga/shared";
import type { AuthPrincipal } from "../core/auth/auth.types";

import type { AuthUserRecord } from "./auth.repository";

export abstract class AgentesRepository {
  abstract criar(input: CriacaoDeAgente, principal: AuthPrincipal): Promise<AuthUserRecord>;
  abstract definirCredencial(userId: string, tokenHash: string, expiresAt: Date, principal: AuthPrincipal): Promise<void>;
  abstract revogarCredencial(userId: string, principal: AuthPrincipal): Promise<void>;
}
