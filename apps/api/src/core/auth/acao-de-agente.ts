import { ForbiddenException, Inject, Injectable, SetMetadata, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { AcaoDeAgente as Acao } from "@plugga/shared";

import { AgentLookupRepository } from "./agent-lookup.repository";
import type { AuthenticatedRequest } from "./auth.types";

export const ACAO_DE_AGENTE_METADATA = "plugga:acao-de-agente";

/**
 * Ponto de entrada de agente (B-01): só a identidade de agente ativa com esta
 * ação passa. Pessoa (sessão) e agente sem a ação recebem 403, mesmo com a tela.
 * Vem depois do `SessionAuthGuard` e antes do `AcessoGuard`.
 */
export const AcaoDeAgente = (acao: Acao): MethodDecorator & ClassDecorator => SetMetadata(ACAO_DE_AGENTE_METADATA, acao);

@Injectable()
export class AcaoDeAgenteGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AgentLookupRepository) private readonly agentes: AgentLookupRepository,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const acao = this.reflector.getAllAndOverride<Acao | undefined>(ACAO_DE_AGENTE_METADATA, [contexto.getHandler(), contexto.getClass()]);
    if (!acao) throw new ForbiddenException("Ponto de entrada de agente sem ação declarada.");
    const principal = contexto.switchToHttp().getRequest<AuthenticatedRequest>().authPrincipal;
    if (!principal || principal.kind !== "service") throw new ForbiddenException("Esta entrada é só para identidades de agente.");
    if (!principal.acoesDeAgente?.includes(acao)) throw new ForbiddenException(`O agente não tem a ação ${acao}.`);
    if (!await this.agentes.identidadeAtiva(principal.id)) throw new ForbiddenException("Identidade de IA ativa necessária.");
    return true;
  }
}
