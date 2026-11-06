import type { AuthPrincipal } from "../core/auth/auth.types";

export abstract class AgentActionScope {
  abstract permite(principal: AuthPrincipal, entityType: string, entityId: string): Promise<boolean>;
}
