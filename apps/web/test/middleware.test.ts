import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { shouldBypassSessionCheck } from "../app/lib/public-paths.ts";

describe("shouldBypassSessionCheck", () => {
  it("serves public background images without checking the session or page permissions", () => {
    assert.equal(shouldBypassSessionCheck("/backgrounds/dashboard-bg.webp"), true);
    assert.equal(shouldBypassSessionCheck("/backgrounds-private"), false);
    assert.equal(shouldBypassSessionCheck("/api/backgrounds/dashboard-bg.webp"), false);
  });

  it("skips remote session validation for public pages other than login", () => {
    for (const path of ["/auth/reset", "/auth/accept-invite", "/privacidade", "/termos"]) {
      assert.equal(shouldBypassSessionCheck(path), true);
    }
    assert.equal(shouldBypassSessionCheck("/login"), false);
    assert.equal(shouldBypassSessionCheck("/clientes"), false);
  });
});
