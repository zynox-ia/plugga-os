import { randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CriacaoDeAgente } from "@plugga/shared";

import { AuditAppender } from "../audit/audit-appender";
import { AcessoNegado, EstadoInvalido } from "../common/errors/dominio";
import type { AuthPrincipal } from "../core/auth/auth.types";
import { mapAcesso } from "../core/auth/user-access.mapper";
import { PrismaAuthService } from "../prisma/prisma-auth.service";
import { AgentesRepository } from "./agentes.repository";
import type { AuthUserRecord } from "./auth.repository";
import { exigeCriacaoDeAgente, exigeGestaoDeAgente } from "./gestao-de-agentes";

const include = { platformRoles: { include: { role: true } }, departamentos: true, agentIdentity: { select: { userId: true } } } satisfies Prisma.UserInclude;

@Injectable()
export class PrismaAgentesRepository extends AgentesRepository {
  constructor(@Inject(PrismaAuthService) private readonly prisma: PrismaAuthService, @Inject(AuditAppender) private readonly audit: AuditAppender) { super(); }

  async criar(input: CriacaoDeAgente, principal: AuthPrincipal): Promise<AuthUserRecord> {
    return this.prisma.$transaction(async (tx) => {
      const id = randomUUID();
      const usuarios = await this.usuariosBloqueados(tx, [principal.id, id]);
      exigeCriacaoDeAgente(principal, usuarios.get(principal.id) ?? null, input);
      const usuario = await tx.user.create({ data: {
        id, email: `${id}@agentes.plugga.invalid`, name: input.name, status: "active",
        departamentos: { create: { departamento: input.departamento, nivel: "membro", telas: input.telas } },
        agentIdentity: { create: { departamento: input.departamento } },
      }, include: { platformRoles: { include: { role: true } }, departamentos: true } });
      await this.audit.append(tx, { eventName: "auth.agent.created", entityType: "user", entityId: id, actorType: "user", actorId: principal.id,
        payload: { departamento: input.departamento, telas: input.telas } });
      return { id, email: usuario.email, name: usuario.name, status: usuario.status, createdAt: usuario.createdAt, tipo: "agente_ia", acesso: mapAcesso(usuario) };
    });
  }

  async definirCredencial(userId: string, tokenHash: string, expiresAt: Date, principal: AuthPrincipal): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const usuarios = await this.usuariosBloqueados(tx, [principal.id, userId]);
      const alvo = usuarios.get(userId) ?? null;
      exigeGestaoDeAgente(principal, usuarios.get(principal.id) ?? null, alvo);
      if (alvo?.status !== "active") throw new EstadoInvalido("O agente precisa estar ativo para receber uma credencial.");
      await tx.agentIdentity.update({ where: { userId }, data: { tokenHash, credentialExpiresAt: expiresAt, revokedAt: null } });
      await this.audit.append(tx, { eventName: "auth.agent.credential_rotated", entityType: "user", entityId: userId, actorType: "user", actorId: principal.id, payload: {} });
    });
  }

  async revogarCredencial(userId: string, principal: AuthPrincipal): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const usuarios = await this.usuariosBloqueados(tx, [principal.id, userId]);
      exigeGestaoDeAgente(principal, usuarios.get(principal.id) ?? null, usuarios.get(userId) ?? null);
      await tx.agentIdentity.update({ where: { userId }, data: { tokenHash: null, credentialExpiresAt: null, revokedAt: new Date() } });
      await this.audit.append(tx, { eventName: "auth.agent.credential_revoked", entityType: "user", entityId: userId, actorType: "user", actorId: principal.id, payload: {} });
    });
  }

  private async usuariosBloqueados(tx: Prisma.TransactionClient, ids: string[]): Promise<Map<string, AuthUserRecord>> {
    if (ids.some((id) => !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))) throw new AcessoNegado("Identidade inválida.");
    // Os triggers de concessão também bloqueiam users; ator/alvo ficam estáveis até o commit.
    await tx.$queryRaw`SELECT id FROM public.users WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
    const usuarios = await tx.user.findMany({ where: { id: { in: ids } }, include });
    return new Map(usuarios.map((user) => [user.id, { id: user.id, name: user.name, email: user.email, status: user.status,
      createdAt: user.createdAt, tipo: user.agentIdentity ? "agente_ia" : "pessoa", acesso: mapAcesso(user) }]));
  }
}
