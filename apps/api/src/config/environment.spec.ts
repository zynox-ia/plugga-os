import { describe, expect, it } from "vitest";

import { validateEnvironment } from "./environment";

const localDatabaseUrl =
  "postgresql://plugga_os:local_only_change_me@localhost:5432/plugga_os?schema=public";

describe("validateEnvironment", () => {
  it("accepts the explicit local development configuration", () => {
    const environment = validateEnvironment({
      NODE_ENV: "development",
      DATABASE_URL: localDatabaseUrl,
      DEV_AUTH_ENABLED: "true",
    });

    expect(environment.DEV_AUTH_ENABLED).toBe(true);
    expect(environment.HOST).toBe("127.0.0.1");
    expect(environment.PORT).toBe(3001);
  });

  it("uses an explicitly configured network bind address", () => {
    const environment = validateEnvironment({
      NODE_ENV: "development",
      HOST: "0.0.0.0",
      DATABASE_URL: localDatabaseUrl,
      DEV_AUTH_ENABLED: "false",
    });

    expect(environment.HOST).toBe("0.0.0.0");
  });

  it("rejects development authentication in production", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: localDatabaseUrl,
        DEV_AUTH_ENABLED: "true",
      }),
    ).toThrow("development authentication cannot be enabled in production");
  });

  it("rejects a non-local database host", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://placeholder:placeholder@db.example.invalid/plugga_os",
        DEV_AUTH_ENABLED: "false",
      }),
    ).toThrow("Block A only permits a local PostgreSQL host");
  });
});
