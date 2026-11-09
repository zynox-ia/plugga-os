import { describe, expect, it } from "vitest";
import { decodeBase32, encodeBase32, totp, verifyTotp, MfaCrypto } from "./mfa-crypto";

describe("TOTP RFC 6238 e proteção do segredo", () => {
  const secret = encodeBase32(Buffer.from("12345678901234567890"));
  it.each([[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]])("vetor RFC em %s", (time, code) => {
    expect(totp(secret, Number(time) * 1000, 8)).toBe(code);
  });
  it("base32 preserva bytes e recusa entrada inválida", () => {
    expect(decodeBase32(secret).toString()).toBe("12345678901234567890");
    expect(() => decodeBase32("not valid!")).toThrow();
  });
  it("recusa replay e aceita somente janela de um passo", () => {
    const now = 1234567890000;
    const code = totp(secret, now);
    const step = verifyTotp(secret, code, now, -1)!;
    expect(verifyTotp(secret, code, now, step)).toBeNull();
    expect(verifyTotp(secret, code, now + 90000, -1)).toBeNull();
  });
  it("AES GCM vincula segredo ao usuário e exige chave dedicada", () => {
    const crypto = new MfaCrypto(Buffer.alloc(32, 42).toString("base64"));
    const encrypted = crypto.encrypt(secret, "user-a");
    expect(encrypted).not.toContain(secret);
    expect(crypto.decrypt(encrypted, "user-a")).toBe(secret);
    expect(() => crypto.decrypt(encrypted, "user-b")).toThrow();
    expect(() => new MfaCrypto(undefined).encrypt(secret, "user-a")).toThrow();
  });
});
