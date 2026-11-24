import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

import type { AuthenticatedRequest } from "./auth.types";

/**
 * Limite de taxa por identidade de agente: o agente conta pelo próprio id, não
 * pelo IP (vários agentes podem sair do mesmo servidor). Sem agente, vale o IP.
 * Depende do `SessionAuthGuard` ter resolvido o principal antes.
 */
@Injectable()
export class ThrottlerPorAgenteGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const principal = (req as unknown as AuthenticatedRequest).authPrincipal;
    if (principal?.kind === "service") return `agente:${principal.id}`;
    return super.getTracker(req);
  }
}
