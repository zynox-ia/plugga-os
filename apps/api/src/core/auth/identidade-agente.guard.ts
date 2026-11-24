import { ForbiddenException, Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";

import { AgentLookupRepository } from "./agent-lookup.repository";
import type { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class IdentidadeAgenteGuard implements CanActivate {
  constructor(@Inject(AgentLookupRepository) private readonly agentes: AgentLookupRepository) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const principal = contexto.switchToHttp().getRequest<AuthenticatedRequest>().authPrincipal;
    if (!principal || principal.kind !== "service" || !await this.agentes.identidadeAtiva(principal.id)) {
      throw new ForbiddenException("Identidade de IA ativa necessária.");
    }
    return true;
  }
}
