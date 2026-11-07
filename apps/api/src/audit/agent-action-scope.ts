import type { AuthPrincipal } from "../core/auth/auth.types";

export abstract class AgentActionScope {
  /** Escopo da entidade por tela; identidade do ator e aprovação são verificadas pelo serviço. */
  abstract permite(principal: AuthPrincipal, entityType: string, entityId: string): Promise<boolean>;
}
