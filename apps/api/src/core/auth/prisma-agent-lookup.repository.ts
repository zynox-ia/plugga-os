import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaAuthService } from "../../prisma/prisma-auth.service";
import { AgentLookupRepository } from "./agent-lookup.repository";
import type { AuthPrincipal } from "./auth.types";
import { mapAcesso } from "./user-access.mapper";

const include = { user: { include: { platformRoles: { include: { role: true } }, departamentos: true } } } satisfies Prisma.AgentIdentityInclude;
type Identidade = Prisma.AgentIdentityGetPayload<{ include: typeof include }>;

@Injectable()
export class PrismaAgentLookupRepository extends AgentLookupRepository {
  constructor(@Inject(PrismaAuthService) private readonly prisma: PrismaAuthService) { super(); }

  async resolvePrincipal(tokenHash: string, now: Date): Promise<AuthPrincipal | null> {
    const identidade = await this.prisma.agentIdentity.findUnique({ where: { tokenHash }, include });
    if (!identidade || identidade.revokedAt || !identidade.credentialExpiresAt || identidade.credentialExpiresAt <= now) return null;
    return this.principal(identidade);
  }

  async identidadeAtiva(userId: string): Promise<boolean> {
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(userId)) return false;
    const identidade = await this.prisma.agentIdentity.findUnique({ where: { userId }, include });
    return identidade !== null && this.principal(identidade) !== null;
  }

  private principal(identidade: Identidade): AuthPrincipal | null {
    const usuario = identidade.user;
    if (usuario.status !== "active" || usuario.platformRoles.length !== 0 || usuario.departamentos.length !== 1) return null;
    const acesso = mapAcesso(usuario);
    const departamento = acesso.departamentos[0];
    if (!departamento || departamento.departamento !== identidade.departamento || departamento.nivel !== "membro") return null;
    return { id: usuario.id, kind: "service", acesso };
  }
}
