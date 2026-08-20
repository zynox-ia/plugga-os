import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaModule } from "../prisma/prisma.module";
import { AuthContext } from "./auth/auth.types";
import { CompositeAuthContext } from "./auth/composite-auth-context";
import { DevAuthGuard } from "./auth/dev-auth.guard";
import { DevHeaderAuthContext } from "./auth/dev-header-auth-context";
import { NullSessionCache } from "./auth/null-session-cache";
import { OriginCheckGuard } from "./auth/origin-check.guard";
import { PermissionsGuard } from "./auth/permissions.guard";
import { PrismaSessionLookupRepository } from "./auth/prisma-session-lookup.repository";
import { RedisSessionCache } from "./auth/redis-session-cache";
import { RolesGuard } from "./auth/roles.guard";
import { SessionAuthContext } from "./auth/session-auth-context";
import { SessionCache } from "./auth/session-cache";
import { SessionLookupRepository } from "./auth/session-lookup.repository";

@Module({
  imports: [PrismaModule],
  providers: [
    { provide: SessionLookupRepository, useClass: PrismaSessionLookupRepository },
    SessionAuthContext,
    DevHeaderAuthContext,
    {
      // Cache real quando SESSION_CACHE_ENABLED (default); NullSessionCache é o
      // rollback instantâneo, sem deploy — mesmo molde de JobsQueueModule.
      provide: SessionCache,
      useFactory: (config: ConfigService): SessionCache =>
        config.get<boolean>("SESSION_CACHE_ENABLED", true)
          ? new RedisSessionCache(config.get<string>("REDIS_URL", "redis://localhost:6379"))
          : new NullSessionCache(),
      inject: [ConfigService],
    },
    {
      // Default provider is the real session context. When DEV_AUTH_ENABLED is
      // on (local/e2e only), a composite also accepts the x-dev-* header path.
      provide: AuthContext,
      useFactory: (
        config: ConfigService,
        session: SessionAuthContext,
        devHeader: DevHeaderAuthContext,
      ): AuthContext =>
        config.get<boolean>("DEV_AUTH_ENABLED", false)
          ? new CompositeAuthContext([devHeader, session])
          : session,
      inject: [ConfigService, SessionAuthContext, DevHeaderAuthContext],
    },
    DevAuthGuard,
    RolesGuard,
    PermissionsGuard,
    // Cross-cutting CSRF defense: shared by every module with mutating routes.
    OriginCheckGuard,
  ],
  exports: [
    AuthContext,
    DevAuthGuard,
    RolesGuard,
    PermissionsGuard,
    OriginCheckGuard,
    SessionLookupRepository,
    SessionCache,
  ],
})
export class CoreModule {}
