import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";

import { PrismaModule } from "../prisma/prisma.module";
import { AuthContext } from "./auth/auth.types";
import { CompositeAuthContext } from "./auth/composite-auth-context";
import { SessionAuthGuard } from "./auth/session-auth.guard";
import { DevHeaderAuthContext } from "./auth/dev-header-auth-context";
import { NullSessionCache } from "./auth/null-session-cache";
import { OriginCheckGuard } from "./auth/origin-check.guard";
import { PermissionsGuard } from "./auth/permissions.guard";
import { PrismaSessionLookupRepository } from "./auth/prisma-session-lookup.repository";
import { RedisSessionCache } from "./auth/redis-session-cache";
import { RolesGuard } from "./auth/roles.guard";
import { RotaFechadaGuard } from "./auth/rota-fechada.guard";
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
          ? new RedisSessionCache(
              config.get<string>("REDIS_URL", "redis://localhost:6379"),
              // Opcional (T115): sem a variável o cache não autentica as entradas.
              config.get<string>("SESSION_CACHE_HMAC_KEY") || undefined,
            )
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
      ): AuthContext => {
        // Atalho de desenvolvimento: só em ambiente local ou de teste (FR-023).
        // A validação do ambiente já recusa DEV_AUTH_ENABLED em produção; aqui é a
        // segunda barreira, e o aviso deixa o atalho ligado visível no log.
        const atalho =
          config.get<boolean>("DEV_AUTH_ENABLED", false) && config.get<string>("NODE_ENV") !== "production";
        if (!atalho) return session;
        new Logger("CoreModule").warn(
          "DEV_AUTH_ENABLED ligado: os cabeçalhos x-dev-* autenticam qualquer requisição. Só para ambiente local ou de teste.",
        );
        return new CompositeAuthContext([devHeader, session]);
      },
      inject: [ConfigService, SessionAuthContext, DevHeaderAuthContext],
    },
    SessionAuthGuard,
    RolesGuard,
    PermissionsGuard,
    // Cross-cutting CSRF defense: shared by every module with mutating routes.
    OriginCheckGuard,
    // Guard global: rota sem declaração de acesso (modo warn registra, enforce nega).
    { provide: APP_GUARD, useClass: RotaFechadaGuard },
  ],
  exports: [
    AuthContext,
    SessionAuthGuard,
    RolesGuard,
    PermissionsGuard,
    OriginCheckGuard,
    SessionLookupRepository,
    SessionCache,
  ],
})
export class CoreModule {}
