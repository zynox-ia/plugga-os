import type { UserAccess } from "@plugga/shared";

/**
 * Mesmos campos de `AuthUserRecord` (apps/api/src/auth/auth.repository.ts),
 * menos `createdAt` — nada aqui lê essa data. `AuthUserRecord` satisfaz esta
 * interface estruturalmente, então os dois lados (guard de autorização e
 * `/auth/me`) podem escrever e ler a mesma entrada sem conversão.
 */
export interface ResolvedSessionUser {
  id: string;
  email: string;
  name: string;
  status: string;
  access: UserAccess;
}

export interface SessionCacheEntry {
  user: ResolvedSessionUser;
}

/**
 * Cache de sessão resolvida, por `tokenHash`. Existe para não pagar o
 * `session.findUnique` (join em 4 níveis) + `session.updateMany` de renovação
 * do Postgres em toda requisição autenticada — hoje isso acontece de 2 a 5
 * vezes por troca de tela (middleware + página + `/auth/me`).
 *
 * Toda implementação real precisa falhar aberta: um erro de Redis deve virar
 * cache miss / no-op, nunca uma exceção que derruba login ou navegação. Na
 * pior hipótese, o comportamento volta a ser o de hoje (sempre ir ao banco).
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
