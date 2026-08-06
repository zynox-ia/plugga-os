import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

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
  ) {}

  /** Creates a session and returns the raw (unhashed) token for the cookie. */
  async issue(userId: string, context: SessionContext): Promise<string> {
    const rawToken = generateOpaqueToken();
    const now = new Date();
    const ttlMinutes = this.config.get<number>("SESSION_TTL_MINUTES", 720);
    const absoluteHours = this.config.get<number>("SESSION_ABSOLUTE_TTL_HOURS", 720);

    await this.repository.createSession({
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(now.getTime() + ttlMinutes * 60_000),
      absoluteExpiresAt: new Date(now.getTime() + absoluteHours * 3_600_000),
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    });

    return rawToken;
  }

  async revoke(rawToken: string): Promise<void> {
    await this.repository.deleteSessionByTokenHash(hashToken(rawToken));
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repository.deleteSessionsForUser(userId);
  }
}
