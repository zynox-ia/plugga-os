import { Inject, Injectable } from "@nestjs/common";

import { AgentLookupRepository } from "./agent-lookup.repository";
import { AuthContext, type AuthenticatedRequest, type AuthPrincipal } from "./auth.types";
import { hashToken } from "./token.util";

@Injectable()
export class AgentAuthContext extends AuthContext {
  constructor(@Inject(AgentLookupRepository) private readonly agentes: AgentLookupRepository) { super(); }

  async resolve(request: AuthenticatedRequest): Promise<AuthPrincipal | null> {
    delete request.databaseAgentHash;
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string") return null;
    const bearer = /^Bearer (plg_agent_[A-Za-z0-9_-]{43})$/i.exec(authorization);
    if (!bearer) return null;
    const tokenHash = hashToken(bearer[1]!);
    const principal = await this.agentes.resolvePrincipal(tokenHash, new Date());
    if (principal) request.databaseAgentHash = tokenHash;
    return principal;
  }
}
