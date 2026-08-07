import { describe, expect, it } from "vitest";

import { maskEmail } from "./email.util";

describe("maskEmail", () => {
  it("keeps the first local character and the full domain", () => {
    expect(maskEmail("person@example.com")).toBe("p***@example.com");
  });

  it("never returns the full local-part for a normal address", () => {
    const masked = maskEmail("admin@plugga.local");
    expect(masked).not.toBe("admin@plugga.local");
    expect(masked).toBe("a***@plugga.local");
  });

  it("falls back to *** for malformed input", () => {
    expect(maskEmail("not-an-email")).toBe("***");
    expect(maskEmail("")).toBe("***");
  });
});
