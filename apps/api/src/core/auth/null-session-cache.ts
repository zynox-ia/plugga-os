import { SessionCache, type SessionCacheEntry } from "./session-cache";

/**
 * Botão de desligar, no mesmo molde de `DisabledJobsQueue`
 * (apps/api/src/jobs/queue/disabled-jobs-queue.ts) — mas ao contrário dela,
 * falha SILENCIOSA por design: um cache de sessão desligado é exatamente o
 * comportamento de hoje (sempre ir ao Postgres), não um erro de configuração
 * a denunciar. Selecionada quando SESSION_CACHE_ENABLED=false.
 */
export class NullSessionCache extends SessionCache {
  async get(): Promise<SessionCacheEntry | null> {
    return null;
  }

  async set(): Promise<void> {
    // no-op
  }

  async invalidate(): Promise<void> {
    // no-op
  }

  async invalidateAllForUser(): Promise<void> {
    // no-op
  }
}
