import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { SessionCache, type ResolvedSessionUser } from "../core/auth/session-cache";
import { generateOpaqueToken, hashToken } from "../core/auth/token.util";
import { AuthRepository } from "./auth.repository";

export interface SessionContext {
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(SessionCache) private readonly cache: SessionCache,
  ) {}

  /**
   * Creates a session and returns the raw (unhashed) token for the cookie.
   * O snapshot no cache é mantido por compatibilidade; a autorização e
   * `/auth/me` sempre revalidam o estado atual no banco.
   */
  async issue(user: ResolvedSessionUser, context: SessionContext): Promise<string> {
    const rawToken = generateOpaqueToken();
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const ttlMinutes = this.config.get<number>("SESSION_TTL_MINUTES", 720);
    const absoluteHours = this.config.get<number>("SESSION_ABSOLUTE_TTL_HOURS", 720);
    const absoluteExpiresAt = new Date(now.getTime() + absoluteHours * 3_600_000);
    const expiresAt = new Date(Math.min(now.getTime() + ttlMinutes * 60_000, absoluteExpiresAt.getTime()));

    await this.repository.createSession({
      userId: user.id,
      tokenHash,
      expiresAt,
      absoluteExpiresAt,
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    });

    const cacheTtlSeconds = Math.min(
      this.config.get<number>("SESSION_CACHE_TTL_SECONDS", 60),
      Math.floor((expiresAt.getTime() - Date.now()) / 1_000),
    );
    if (cacheTtlSeconds > 0) {
      await this.cache.set(tokenHash, user.id, { user }, cacheTtlSeconds);
    }

    return rawToken;
  }

  async revoke(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    await this.repository.deleteSessionByTokenHash(tokenHash);
    await this.cache.invalidate(tokenHash);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repository.deleteSessionsForUser(userId);
    await this.cache.invalidateAllForUser(userId);
  }
}
