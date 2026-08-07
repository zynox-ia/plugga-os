import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { clientForwardedFor, isIpAddress } from "../app/lib/forwarded-for.ts";

function requestWith(forwardedFor?: string): Request {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
  });
}

afterEach(() => {
  delete process.env.WEB_TRUST_PROXY;
});

describe("clientForwardedFor", () => {
  it("forwards nothing by default, even when the header is present", () => {
    // Fail closed: without a trusted proxy the header is client-controlled.
    assert.equal(clientForwardedFor(requestWith("203.0.113.7")), null);
  });

  it("forwards nothing when the flag is anything other than true", () => {
    for (const value of ["", "false", "0", "yes", "TRUE-ish"]) {
      process.env.WEB_TRUST_PROXY = value;
      assert.equal(clientForwardedFor(requestWith("203.0.113.7")), null);
    }
  });

  it("forwards a single well-formed address once trust is opted into", () => {
    process.env.WEB_TRUST_PROXY = "true";
    assert.equal(clientForwardedFor(requestWith("203.0.113.7")), "203.0.113.7");
    assert.equal(clientForwardedFor(requestWith("  203.0.113.7  ")), "203.0.113.7");
    assert.equal(clientForwardedFor(requestWith("2001:db8::1")), "2001:db8::1");
  });

  it("drops a multi-hop chain instead of relaying it raw", () => {
    process.env.WEB_TRUST_PROXY = "true";
    // More hops than this app can vouch for; the client controls the left side.
    assert.equal(clientForwardedFor(requestWith("203.0.113.7, 198.51.100.2")), null);
  });

  it("drops malformed values", () => {
    process.env.WEB_TRUST_PROXY = "true";
    for (const value of [
      "not-an-ip",
      "203.0.113.7:8080",
      "999.0.113.7",
      "203.0.113",
      "203.0.113.07",
      "evil.example.com",
      "",
    ]) {
      assert.equal(clientForwardedFor(requestWith(value)), null, `should drop ${value}`);
    }
  });

  it("forwards nothing when the header is absent", () => {
    process.env.WEB_TRUST_PROXY = "true";
    assert.equal(clientForwardedFor(requestWith()), null);
  });
});

describe("isIpAddress", () => {
  it("accepts bare IPv4 and IPv6 literals", () => {
    assert.equal(isIpAddress("127.0.0.1"), true);
    assert.equal(isIpAddress("0.0.0.0"), true);
    assert.equal(isIpAddress("255.255.255.255"), true);
    assert.equal(isIpAddress("::1"), true);
  });

  it("rejects anything that is not a bare address", () => {
    assert.equal(isIpAddress("256.0.0.1"), false);
    assert.equal(isIpAddress("1.2.3"), false);
    assert.equal(isIpAddress("1.2.3.4.5"), false);
    assert.equal(isIpAddress("localhost"), false);
  });
});
