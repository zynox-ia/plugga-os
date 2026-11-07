import { randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { agenteDaEquipeSchema, type AgenteDaEquipe, type CredencialDeAgente, type CriacaoDeAgente } from "@plugga/shared";

import type { AuthPrincipal } from "../core/auth/auth.types";
import { hashToken } from "../core/auth/token.util";
import { AgentesRepository } from "./agentes.repository";
import { EquipeService } from "./equipe.service";

@Injectable()
export class AgentesEquipeService {
  constructor(@Inject(AgentesRepository) private readonly repository: AgentesRepository, @Inject(EquipeService) private readonly equipe: EquipeService) {}

  async criar(principal: AuthPrincipal, input: CriacaoDeAgente): Promise<AgenteDaEquipe> {
    await this.equipe.validarCriacaoDeAgente(principal, input);
    const registro = await this.repository.criar(input, principal);
    return agenteDaEquipeSchema.parse(await this.equipe.apresentarAgente(principal, registro));
  }

  async emitirCredencial(principal: AuthPrincipal, userId: string): Promise<CredencialDeAgente> {
    await this.equipe.validarGestaoDeAgente(principal, userId);
    const token = `plg_agent_${randomBytes(32).toString("base64url")}`;
    const expiresAt = new Date(Date.now() + 30 * 86_400_000);
    await this.repository.definirCredencial(userId, hashToken(token), expiresAt, principal);
    return { userId, token, expiresAt: expiresAt.toISOString() };
  }

  async revogarCredencial(principal: AuthPrincipal, userId: string): Promise<{ ok: true }> {
    await this.equipe.validarGestaoDeAgente(principal, userId);
    await this.repository.revogarCredencial(userId, principal);
    return { ok: true };
  }
}
