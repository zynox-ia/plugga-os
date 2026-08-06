import { Injectable } from "@nestjs/common";

interface AttemptState {
  failures: number;
  lockedUntil: number;
}

/**
 * Best-effort progressive login lockout keyed by identity+IP. In-memory and
 * per-process (sufficient for an internal single-tenant OS); it complements the
 * per-IP throttler. On repeated failures the lock window grows exponentially.
 */
@Injectable()
export class LockoutService {
  private readonly attempts = new Map<string, AttemptState>();
  private readonly freeAttempts = 5;
  private readonly baseLockMs = 30_000;
  private readonly maxLockMs = 15 * 60_000;

  isLocked(key: string, now = Date.now()): boolean {
    const state = this.attempts.get(key);
    return state !== undefined && state.lockedUntil > now;
  }

  recordFailure(key: string, now = Date.now()): void {
    const state = this.attempts.get(key) ?? { failures: 0, lockedUntil: 0 };
    state.failures += 1;

    if (state.failures > this.freeAttempts) {
      const overage = state.failures - this.freeAttempts;
      const lockMs = Math.min(this.baseLockMs * 2 ** (overage - 1), this.maxLockMs);
      state.lockedUntil = now + lockMs;
    }

    this.attempts.set(key, state);
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}
