import type { Acesso } from "@plugga/shared";

/**
 * Mesmos campos de `AuthUserRecord` (apps/api/src/auth/auth.repository.ts),
 * menos `createdAt` — nada aqui lê essa data. `AuthUserRecord` satisfaz esta
 * interface estruturalmente, sem conversão.
 */
export interface ResolvedSessionUser {
  id: string;
  email: string;
  name: string;
  status: string;
  acesso: Acesso;
}

export interface SessionCacheEntry {
  user: ResolvedSessionUser;
}

/**
 * Snapshot de sessão, por `tokenHash`, mantido por compatibilidade.
 * NÃO concede autoridade: guard e `/auth/me` consultam o banco em cada
 * requisição, mesmo quando SESSION_CACHE_ENABLED=true. Isso custa uma leitura
 * no banco por resolução, mas garante revogação e acesso atual mesmo com
 * invalidação perdida ou escrita concorrente posterior ao logout/reset.
 *
 * Toda implementação real precisa falhar aberta: um erro de Redis deve virar
 * cache miss / no-op, nunca uma exceção que derruba login ou navegação. Na
 * pior hipótese, somente o snapshot deixa de ser atualizado.
 */
export abstract class SessionCache {
  abstract get(tokenHash: string): Promise<SessionCacheEntry | null>;
  abstract set(
    tokenHash: string,
    userId: string,
    entry: SessionCacheEntry,
    ttlSeconds: number,
  ): Promise<void>;
  /** Invalida uma sessão específica (logout). */
  abstract invalidate(tokenHash: string): Promise<void>;
  /** Invalida todas as sessões cacheadas de um usuário (desativação, reset de senha, troca de acesso). */
  abstract invalidateAllForUser(userId: string): Promise<void>;
}
