import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id password hashing (ADR-0008). @node-rs/argon2 defaults to Argon2id;
 * parameters follow OWASP guidance (~19 MiB memory, 2 iterations, single lane).
 * Hashes are opaque and are never logged or emitted in events.
 */
@Injectable()
export class PasswordService {
  private readonly options = {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  } as const;

  /**
   * Reference hash of a throwaway secret, used only to burn the same KDF time
   * when there is no stored credential. Warmed at construction so the first
   * unknown-account login pays for a verify, not a hash plus a verify.
   */
  private readonly dummyHash: Promise<string>;

  constructor() {
    this.dummyHash = hash(randomBytes(32).toString("hex"), this.options);
    // verifyDummy() is the only consumer and tolerates a rejection; this keeps a
    // boot-time failure from surfacing as an unhandled rejection first.
    void this.dummyHash.catch(() => undefined);
  }

  hash(plainPassword: string): Promise<string> {
    return hash(plainPassword, this.options);
  }

  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plainPassword);
    } catch {
      return false;
    }
  }

  /**
   * Always false, but spends a real Argon2id verify first. Argon2id is
   * deliberately slow, so returning early when an account has no credential
   * makes "unknown email" answer in microseconds while a real one costs a full
   * KDF pass — a timing oracle that enumerates valid accounts no matter how
   * generic the response body is.
   */
  async verifyDummy(plainPassword: string): Promise<boolean> {
    try {
      await this.verify(await this.dummyHash, plainPassword);
    } catch {
      // A failed warm-up must not turn into a distinguishable error path.
    }
    return false;
  }
}
