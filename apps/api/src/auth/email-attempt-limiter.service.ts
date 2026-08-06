import { Injectable } from "@nestjs/common";

interface WindowState {
  count: number;
  windowStart: number;
}

/**
 * Coarse, email-only cap on failed login attempts, stacked on top of
 * LockoutService's (email, IP) lock rather than replacing it. That lock alone
 * is bypassable by rotating X-Forwarded-For (client-controlled): each new IP
 * gets a fresh bucket, so an attacker can brute-force one account forever by
 * cycling IPs. This limiter tracks failures by email alone in a long, high
 * fixed window, so rotating IPs no longer resets progress toward a block.
 * The threshold must stay high enough that it never fires on real usage (typos,
 * a forgotten password) — it exists to make sustained guessing eventually
 * stall, not to be a tight per-user rate limit.
 */
@Injectable()
export class EmailAttemptLimiter {
  private readonly attempts = new Map<string, WindowState>();
  private readonly limit = 30;
  private readonly windowMs = 60 * 60_000;

  isBlocked(email: string, now = Date.now()): boolean {
    const state = this.attempts.get(email);
    if (!state || now - state.windowStart > this.windowMs) return false;
    return state.count >= this.limit;
  }

  recordFailure(email: string, now = Date.now()): void {
    const state = this.attempts.get(email);
    if (!state || now - state.windowStart > this.windowMs) {
      this.attempts.set(email, { count: 1, windowStart: now });
      return;
    }
    state.count += 1;
  }

  reset(email: string): void {
    this.attempts.delete(email);
  }
}
