import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";

import { argon2Options } from "./argon2-options";

/**
 * Argon2id password hashing (ADR-0008). @node-rs/argon2 defaults to Argon2id.
 * Hashes are opaque and are never logged or emitted in events.
 */
@Injectable()
export class PasswordService {
  private readonly options = argon2Options;

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
   * Paga o custo de um verify real sem ter hash nenhum. Sem isto, login com
   * e-mail inexistente responde em ~1 query e login com e-mail existente paga
   * o Argon2id — a diferença de tempo enumera quais e-mails têm conta, o que
   * `requestReset` promete nunca revelar.
   */
  async verifyAgainstDummy(plainPassword: string): Promise<void> {
    this.dummyHash ??= await this.hash("dummy-timing-equalizer");
    await this.verify(this.dummyHash, plainPassword);
  }

  private dummyHash: string | null = null;
}
