import { describe, expect, it } from "vitest";

import {
  assertSafeTestDatabaseUrl,
  assertSafeTestRedisUrl,
  assertSafeTestStorageEndpoint,
} from "./safe-test-environment";

describe("assertSafeTestDatabaseUrl", () => {
  it("accepts the isolated Local Test database", () => {
    expect(() =>
      assertSafeTestDatabaseUrl(
        "postgresql://plugga_os_test:local_test_only@127.0.0.1:55433/plugga_os_test?schema=public",
      ),
    ).not.toThrow();
  });

  it("accepts the ephemeral CI port only when CI is explicit", () => {
    const url =
      "postgresql://plugga_os_test:local_test_only@127.0.0.1:55432/plugga_os_test?schema=public";
    expect(() => assertSafeTestDatabaseUrl(url, true)).not.toThrow();
    expect(() => assertSafeTestDatabaseUrl(url, false)).toThrow(/LOCAL TEST/);
  });

  it.each([
    "postgresql://plugga_os:local_only@127.0.0.1:55432/plugga_os?schema=public",
    "postgresql://plugga_os_test:local_test_only@127.0.0.1:5432/plugga_os_test?schema=public",
    "postgresql://plugga_os_test:local_test_only@db.example.invalid:55433/plugga_os_test?schema=public",
  ])("refuses an unsafe database-backed test target: %s", (url) => {
    expect(() => assertSafeTestDatabaseUrl(url)).toThrow(/Refusing database-backed test/);
  });
});

describe("assertSafeTestRedisUrl", () => {
  it("accepts the isolated Local Test Redis target", () => {
    expect(() => assertSafeTestRedisUrl("redis://127.0.0.1:56380")).not.toThrow();
  });

  it.each([
    "redis://localhost:6379",
    "redis://127.0.0.1:6379",
    "redis://redis.example.invalid:56380",
  ])("refuses an unsafe Redis-backed test target: %s", (url) => {
    expect(() => assertSafeTestRedisUrl(url)).toThrow(/Refusing Redis-backed test/);
  });
});

describe("assertSafeTestStorageEndpoint", () => {
  it("accepts the isolated local object-storage target", () => {
    expect(() =>
      assertSafeTestStorageEndpoint(
        "http://localhost:59002",
        "plugga-faturas-test",
      ),
    ).not.toThrow();
  });

  it.each([
    "http://localhost:9000",
    "http://127.0.0.1:9001",
    "http://localhost:59000",
    "https://storage.example.invalid:59002",
  ])("refuses an unsafe storage-backed test target: %s", (url) => {
    expect(() => assertSafeTestStorageEndpoint(url)).toThrow(
      /Refusing storage-backed test/,
    );
  });

  it("does not depend on a bucket name: buckets are derived per company and department", () => {
    expect(() => assertSafeTestStorageEndpoint("http://127.0.0.1:59002")).not.toThrow();
  });
});
