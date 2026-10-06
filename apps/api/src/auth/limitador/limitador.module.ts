import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { ContadorTentativas } from "./contador-tentativas";
import { LimitadorLogin } from "./limitador-login.service";
import { MemoriaContadorTentativas } from "./memoria-contador-tentativas";
import { RedisContadorTentativas } from "./redis-contador-tentativas";

/**
 * Contadores de abuso (US11, T112): um único `ContadorTentativas` serve o
 * limitador de login e o throttler das rotas. `RATE_LIMIT_STORE=redis` (padrão)
 * usa o Redis; `memory` é para teste e para quem não tem Redis.
 */
@Module({
  providers: [
    {
      provide: ContadorTentativas,
      useFactory: (config: ConfigService): ContadorTentativas =>
        config.get<string>("RATE_LIMIT_STORE", "redis") === "redis"
          ? new RedisContadorTentativas(config.get<string>("REDIS_URL", "redis://localhost:6379"))
          : new MemoriaContadorTentativas(),
      inject: [ConfigService],
    },
    LimitadorLogin,
  ],
  exports: [ContadorTentativas, LimitadorLogin],
})
export class LimitadorModule {}
