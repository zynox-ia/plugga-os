import { describe, expect, it } from "vitest";

import { normalizeName, onlyDigits } from "./prisma-clientes.repository";

describe("onlyDigits", () => {
  it("strips formatting so differently-punctuated phones compare equal", () => {
    expect(onlyDigits("+55 (92) 90000-0000")).toBe(onlyDigits("55 92 90000 0000"));
    expect(onlyDigits("92 90000 0000")).toBe("92900000000");
  });
});

describe("normalizeName", () => {
  it("ignores case, diacritics and punctuation", () => {
    expect(normalizeName("José da Silva")).toBe("jose da silva");
    expect(normalizeName("JOSÉ DA SILVA")).toBe(normalizeName("José da Silva"));
    expect(normalizeName("José, da-Silva!")).toBe("jose da silva");
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeName("Hotel   Rio   Negro")).toBe("hotel rio negro");
  });

  it("treats an added legal suffix as the same underlying name via substring containment", () => {
    const a = normalizeName("Hotel Rio Negro");
    const b = normalizeName("Hotel Rio Negro Ltda");
    expect(b.includes(a)).toBe(true);
  });
});
