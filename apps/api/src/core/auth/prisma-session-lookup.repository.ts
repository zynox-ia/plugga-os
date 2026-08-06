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
      include: { user: { include: { roles: { include: { role: true } } } } },
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

    return {
      id: session.userId,
      kind: "user",
      roles: this.mapRoles(session.user.roles.map((assignment) => assignment.role.key)),
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

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { lastUsedAt: now, expiresAt: nextExpiry },
      select: { id: true },
    });
  }

  private mapRoles(keys: string[]): RoleKey[] {
    return keys.flatMap((key) => {
      const parsed = roleKeySchema.safeParse(key);
      return parsed.success ? [parsed.data] : [];
    });
  }
}
