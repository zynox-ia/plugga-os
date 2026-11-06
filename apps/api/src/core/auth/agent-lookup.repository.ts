import type { AuthPrincipal } from "./auth.types";

export abstract class AgentLookupRepository {
  abstract resolvePrincipal(tokenHash: string, now: Date): Promise<AuthPrincipal | null>;
  abstract identidadeAtiva(userId: string): Promise<boolean>;
}
