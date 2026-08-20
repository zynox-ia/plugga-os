import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { flattenRoles } from "@plugga/shared";

import { PrismaService } from "../../prisma/prisma.service";
import type { AuthPrincipal } from "./auth.types";
import { SessionCache, type ResolvedSessionUser } from "./session-cache";
import {
  SessionLookupRepository,
  type SessionLookupContext,
} from "./session-lookup.repository";
import { mapUserAccess } from "./user-access.mapper";

@Injectable()
export class PrismaSessionLookupRepository extends SessionLookupRepository {
  private readonly logger = new Logger(PrismaSessionLookupRepository.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(SessionCache) private readonly cache: SessionCache,
  ) {
    super();
  }

  async resolvePrincipal(
    tokenHash: string,
    context: SessionLookupContext,
  ): Promise<AuthPrincipal | null> {
    const start = process.hrtime.bigint();
    const cached = await this.cache.get(tokenHash);
    if (cached) {
      this.logResolution("cache_hit", start);
      return this.toPrincipal(cached.user);
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            platformRoles: { include: { role: true } },
            memberships: { include: { roles: { include: { role: true } }, departments: true } },
          },
        },
      },
    });

    if (!session) {
      this.logResolution("cache_miss_not_found", start);
      return null;
    }

    const expired =
      session.expiresAt <= context.now || session.absoluteExpiresAt <= context.now;
    const inactiveUser = session.user.status !== "active";

    if (expired || inactiveUser) {
      // Best-effort cleanup of a session that can never authenticate again.
      // Nunca foi um cache hit (o miss acima é quem chega aqui), então não há
      // o que invalidar no cache.
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      this.logResolution("cache_miss_invalid", start);
      return null;
    }

    await this.applySlidingRenewal(session.id, session.lastUsedAt, session.absoluteExpiresAt, context.now);

    const resolvedUser: ResolvedSessionUser = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      status: session.user.status,
      access: mapUserAccess(session.user),
    };

    const ttlSeconds = this.config.get<number>("SESSION_CACHE_TTL_SECONDS", 60);
    await this.cache.set(tokenHash, session.userId, { user: resolvedUser }, ttlSeconds);

    this.logResolution("cache_miss", start);
    return this.toPrincipal(resolvedUser);
  }

  // O principal carrega a união achatada dos papéis (plataforma + todas as
  // empresas), que é o que `RolesGuard` consome. Onde cada papel vale é
  // resolvido por quem precisa do contexto de empresa, lendo o acesso inteiro
  // — carregar isso em toda requisição custaria mais do que rende.
  private toPrincipal(user: ResolvedSessionUser): AuthPrincipal {
    return { id: user.id, kind: "user", roles: flattenRoles(user.access) };
  }

  private async applySlidingRenewal(
    sessionId: string,
    lastUsedAt: Date,
    absoluteExpiresAt: Date,
    now: Date,
  ): Promise<void> {
    // Sem este piso, a renovação escrevia no Postgres em TODA requisição
    // autenticada, não importa se a sessão foi tocada há 1 segundo — era o
    // maior custo de escrita por navegação antes deste cache existir, e
    // continua sendo pago mesmo em cache miss (ex.: Redis fora do ar) sem
    // este debounce.
    const debounceMinutes = this.config.get<number>("SESSION_RENEWAL_DEBOUNCE_MINUTES", 5);
    if (now.getTime() - lastUsedAt.getTime() < debounceMinutes * 60_000) {
      return;
    }

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

  private logResolution(outcome: string, start: bigint): void {
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    this.logger.debug(`session_resolve outcome=${outcome} ms=${elapsedMs.toFixed(1)}`);
  }
}
