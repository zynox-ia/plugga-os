import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ServiceUnavailableException } from "@nestjs/common";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function encodeBase32(bytes: Buffer): string {
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; output += BASE32[(value >>> bits) & 31]; }
  }
  if (bits) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}
export function decodeBase32(input: string): Buffer {
  if (!/^[A-Z2-7]+$/.test(input)) throw new Error("Invalid base32");
  let bits = 0, value = 0;
  const output: number[] = [];
  for (const char of input) {
    value = (value << 5) | BASE32.indexOf(char); bits += 5;
    if (bits >= 8) { bits -= 8; output.push((value >>> bits) & 255); }
  }
  return Buffer.from(output);
}
export function totp(secret: string, now: number, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).padStart(digits, "0");
}
export function verifyTotp(secret: string, code: string, now: number, lastStep: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30_000);
  for (const candidate of [step, step - 1, step + 1]) {
    if (candidate > lastStep && timingSafeEqual(Buffer.from(totp(secret, candidate * 30_000)), Buffer.from(code))) return candidate;
  }
  return null;
}
export function recoveryHash(userId: string, code: string): string {
  return createHash("sha256").update(`plugga/mfa/recovery/v1:${userId}:${code.toLowerCase().replace(/-/g, "")}`).digest("hex");
}
export function newRecoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => randomBytes(10).toString("hex").match(/.{4}/g)!.join("-"));
}

/** Dedicated independent key; rotating cookie signatures must not lose authenticators. */
export class MfaCrypto {
  private readonly key: Buffer | null;
  constructor(encoded: string | undefined) {
    this.key = encoded ? Buffer.from(encoded, "base64") : null;
    if (encoded && (this.key?.length !== 32 || this.key.toString("base64") !== encoded)) throw new Error("Invalid MFA_ENCRYPTION_KEY");
  }
  private requireKey(): Buffer {
    if (!this.key) throw new ServiceUnavailableException("A autenticação em duas etapas está indisponível no momento.");
    return this.key;
  }
  encrypt(secret: string, userId: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.requireKey(), iv);
    cipher.setAAD(Buffer.from(`plugga/mfa/totp/v1:${userId}`));
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
  }
  decrypt(encrypted: string, userId: string): string {
    const key = this.requireKey();
    try {
      const packed = Buffer.from(encrypted, "base64");
      const decipher = createDecipheriv("aes-256-gcm", key, packed.subarray(0, 12));
      decipher.setAAD(Buffer.from(`plugga/mfa/totp/v1:${userId}`));
      decipher.setAuthTag(packed.subarray(12, 28));
      return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString("utf8");
    } catch { throw new ServiceUnavailableException("A autenticação em duas etapas está indisponível no momento."); }
  }
}
