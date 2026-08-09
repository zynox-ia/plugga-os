import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { roleKeySchema, type RoleKey } from "@plugga/shared";

import { PrismaService } from "../../prisma/prisma.service";
import type { AuthPrincipal } from "./auth.types";
import {
  SessionLookupRepository,
  type SessionLookupContext,
} from "./session-lookup.repository";

@Injectable()
export class PrismaSessionLookupRepository extends SessionLookupRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {
    super();
  }

  async resolvePrincipal(
    tokenHash: string,
    context: SessionLookupContext,
  ): Promise<AuthPrincipal | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            platformRoles: { include: { role: true } },
            memberships: { include: { roles: { include: { role: true } } } },
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    const expired =
      session.expiresAt <= context.now || session.absoluteExpiresAt <= context.now;
    const inactiveUser = session.user.status !== "active";

    if (expired || inactiveUser) {
      // Best-effort cleanup of a session that can never authenticate again.
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }

    await this.applySlidingRenewal(session.id, session.absoluteExpiresAt, context.now);

    // O principal carrega a união achatada dos papéis (plataforma + todas as
    // empresas), que é o que `RolesGuard` consome. Onde cada papel vale é
    // resolvido por quem precisa do contexto de empresa, lendo o acesso inteiro
    // — carregar isso em toda requisição custaria mais do que rende.
    return {
      id: session.userId,
      kind: "user",
      roles: this.mapRoles([
        ...session.user.platformRoles.map((assignment) => assignment.role.key),
        ...session.user.memberships.flatMap((membership) =>
          membership.roles.map((assignment) => assignment.role.key),
        ),
      ]),
    };
  }

  private async applySlidingRenewal(
    sessionId: string,
    absoluteExpiresAt: Date,
    now: Date,
  ): Promise<void> {
    const ttlMinutes = this.config.get<number>("SESSION_TTL_MINUTES", 720);
    const slidingExpiry = new Date(now.getTime() + ttlMinutes * 60_000);
    const nextExpiry = slidingExpiry < absoluteExpiresAt ? slidingExpiry : absoluteExpiresAt;

    // Best-effort como o cleanup acima: um logout em outra aba pode apagar a
    // sessão entre o findUnique e este write — 0 linhas afetadas não é erro,
    // e um update estrito viraria 500 numa requisição autenticada em voo.
    await this.prisma.session.updateMany({
      where: { id: sessionId },
      data: { lastUsedAt: now, expiresAt: nextExpiry },
    });
  }

  // O mesmo papel pode vir das duas empresas (financeiro na Plugga e na Waze);
  // o principal lista cada um uma vez só.
  private mapRoles(keys: string[]): RoleKey[] {
    const validos = new Set<RoleKey>();
    for (const key of keys) {
      const parsed = roleKeySchema.safeParse(key);
      if (parsed.success) {
        validos.add(parsed.data);
      }
    }
    return [...validos];
  }
}
