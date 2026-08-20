import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";

import { SessionCache, type SessionCacheEntry } from "./session-cache";

const KEY_PREFIX = "session:v1:principal:";
const INDEX_PREFIX = "session:v1:by-user:";
/** Folga sobre o TTL da entrada, para o índice por usuário nunca expirar antes dela. */
const INDEX_TTL_SLACK_SECONDS = 30;

/**
 * Implementação real, sobre o mesmo `ioredis` já usado pelo BullMQ
 * (apps/api/src/jobs/queue/bull-jobs-queue.ts), mas com conexão própria: o
 * cache de sessão tem de estar sempre ligado (não é opcional como a fila) e
 * precisa falhar rápido, não ficar retentando indefinidamente — o oposto do
 * `maxRetriesPerRequest: null` que o BullMQ exige para comandos bloqueantes.
 *
 * Todo método engole o próprio erro: uma falha do Redis nunca deve virar 500
 * em login ou navegação, só um cache miss (ou um `set`/`invalidate` que não
 * fez efeito, e por isso a requisição seguinte tenta de novo).
 */
@Injectable()
export class RedisSessionCache extends SessionCache implements OnModuleDestroy {
  private readonly logger = new Logger(RedisSessionCache.name);
  private readonly client: Redis;

  constructor(redisUrl: string) {
    super();
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      // Mesma folga documentada em apps/web/middleware.ts para chamadas de
      // rede autenticadas: no dev local, REDIS_URL aponta para o mesmo túnel
      // SSH do Postgres (~2s de base). Um timeout mais curto faria o cache
      // nunca conectar nesse ambiente e cair em fail-open sempre — sem
      // quebrar nada, mas também sem entregar o ganho que é o objetivo desta
      // mudança. Em produção (mesma máquina do Redis) isso não pesa: a
      // latência real fica na casa de milissegundos.
      connectTimeout: 3_000,
      commandTimeout: 2_000,
    });
    // ioredis sem listener de erro derruba o processo no primeiro erro de
    // conexão (comportamento padrão de EventEmitter para o evento "error").
    this.client.on("error", (error) => {
      this.logger.warn(`redis session cache connection error: ${error.message}`);
    });
  }

  async get(tokenHash: string): Promise<SessionCacheEntry | null> {
    try {
      const raw = await this.client.get(KEY_PREFIX + tokenHash);
      if (!raw) return null;
      return JSON.parse(raw) as SessionCacheEntry;
    } catch (error) {
      this.logger.warn(`session cache get failed, treating as miss: ${this.message(error)}`);
      return null;
    }
  }

  async set(
    tokenHash: string,
    userId: string,
    entry: SessionCacheEntry,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      const payload = JSON.stringify(entry);
      const indexTtl = ttlSeconds + INDEX_TTL_SLACK_SECONDS;
      await this.client
        .multi()
        .set(KEY_PREFIX + tokenHash, payload, "EX", ttlSeconds)
        .sadd(INDEX_PREFIX + userId, tokenHash)
        .expire(INDEX_PREFIX + userId, indexTtl)
        .exec();
    } catch (error) {
      this.logger.warn(`session cache set failed, ignoring: ${this.message(error)}`);
    }
  }

  async invalidate(tokenHash: string): Promise<void> {
    try {
      await this.client.del(KEY_PREFIX + tokenHash);
    } catch (error) {
      this.logger.warn(`session cache invalidate failed, ignoring: ${this.message(error)}`);
    }
  }

  async invalidateAllForUser(userId: string): Promise<void> {
    try {
      const tokenHashes = await this.client.smembers(INDEX_PREFIX + userId);
      const keys = tokenHashes.map((hash) => KEY_PREFIX + hash);
      keys.push(INDEX_PREFIX + userId);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      this.logger.warn(`session cache invalidateAllForUser failed, ignoring: ${this.message(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch (error) {
      this.logger.warn(`redis session cache quit failed, ignoring: ${this.message(error)}`);
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
