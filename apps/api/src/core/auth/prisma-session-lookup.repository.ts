import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaService } from "../../prisma/prisma.service";
import type { AuthPrincipal } from "./auth.types";
import { SessionCache, type ResolvedSessionUser } from "./session-cache";
import {
  SessionLookupRepository,
  type SessionLookupContext,
} from "./session-lookup.repository";
import { mapAcesso } from "./user-access.mapper";

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
    // O banco é a autoridade, inclusive com Redis habilitado. Uma invalidação
    // pode falhar ou ser seguida por um set em voo; o snapshot nunca autentica.
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            platformRoles: { include: { role: true } },
            departamentos: true,
          },
        },
      },
    });

    if (!session) {
      this.logResolution("db_not_found", start);
      return null;
    }

    const expired =
      session.expiresAt <= context.now || session.absoluteExpiresAt <= context.now;
    const inactiveUser = session.user.status !== "active";

    if (expired || inactiveUser) {
      // Best-effort cleanup of a session that can never authenticate again.
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      await this.cache.invalidate(tokenHash);
      this.logResolution("db_invalid", start);
      return null;
    }

    const expiresAt = await this.applySlidingRenewal(
      session.id, session.lastUsedAt, session.expiresAt, session.absoluteExpiresAt, context.now,
    );
    if (!expiresAt) {
      this.logResolution("db_revoked_during_renewal", start);
      return null;
    }

    const resolvedUser: ResolvedSessionUser = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      status: session.user.status,
      acesso: mapAcesso(session.user),
    };

    const ttlSeconds = Math.min(
      this.config.get<number>("SESSION_CACHE_TTL_SECONDS", 60),
      Math.floor((Math.min(expiresAt.getTime(), session.absoluteExpiresAt.getTime()) - context.now.getTime()) / 1_000),
    );
    if (ttlSeconds > 0) {
      await this.cache.set(tokenHash, session.userId, { user: resolvedUser }, ttlSeconds);
    }

    this.logResolution("db_valid", start);
    return this.toPrincipal(resolvedUser);
  }

  private toPrincipal(user: ResolvedSessionUser): AuthPrincipal {
    return { id: user.id, kind: "user", acesso: user.acesso };
  }

  private async applySlidingRenewal(
    sessionId: string,
    lastUsedAt: Date,
    expiresAt: Date,
    absoluteExpiresAt: Date,
    now: Date,
  ): Promise<Date | null> {
    // O banco é consultado em toda requisição, mas este piso mantém a
    // renovação periódica para evitar uma escrita por chamada autenticada.
    const debounceMinutes = this.config.get<number>("SESSION_RENEWAL_DEBOUNCE_MINUTES", 5);
    if (now.getTime() - lastUsedAt.getTime() < debounceMinutes * 60_000) {
      return expiresAt;
    }

    const ttlMinutes = this.config.get<number>("SESSION_TTL_MINUTES", 720);
    const slidingExpiry = new Date(now.getTime() + ttlMinutes * 60_000);
    const nextExpiry = slidingExpiry < absoluteExpiresAt ? slidingExpiry : absoluteExpiresAt;

    // Logout, reset ou desativação entre leitura e renovação recusam a sessão.
    const renewed = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        expiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
        user: { status: "active" },
      },
      data: { lastUsedAt: now, expiresAt: nextExpiry },
    });
    return renewed.count > 0 ? nextExpiry : null;
  }

  private logResolution(outcome: string, start: bigint): void {
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    this.logger.debug(`session_resolve outcome=${outcome} ms=${elapsedMs.toFixed(1)}`);
  }
}
