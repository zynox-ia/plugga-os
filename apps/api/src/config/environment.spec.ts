import { describe, expect, it } from "vitest";

import { validateEnvironment } from "./environment";

const localDatabaseUrl =
  "postgresql://plugga_os:local_only_change_me@localhost:5432/plugga_os?schema=public";
const sessionSecret = "local_only_session_secret_change_me_please";

describe("validateEnvironment", () => {
  it("accepts the explicit local development configuration", () => {
    const environment = validateEnvironment({
      NODE_ENV: "development",
      DATABASE_URL: localDatabaseUrl,
      DEV_AUTH_ENABLED: "true",
      AUTH_SESSION_SECRET: sessionSecret,
    });

    expect(environment.DEV_AUTH_ENABLED).toBe(true);
    expect(environment.HOST).toBe("127.0.0.1");
    expect(environment.PORT).toBe(3001);
    expect(environment.EMAIL_PROVIDER).toBe("noop");
  });

  it("uses an explicitly configured network bind address", () => {
    const environment = validateEnvironment({
      NODE_ENV: "development",
      HOST: "0.0.0.0",
      DATABASE_URL: localDatabaseUrl,
      DEV_AUTH_ENABLED: "false",
      AUTH_SESSION_SECRET: sessionSecret,
    });

    expect(environment.HOST).toBe("0.0.0.0");
  });

  it("rejects development authentication in production", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: localDatabaseUrl,
        DEV_AUTH_ENABLED: "true",
        AUTH_SESSION_SECRET: sessionSecret,
      }),
    ).toThrow("development authentication cannot be enabled in production");
  });

  it("rejects a non-local database host", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://placeholder:placeholder@db.example.invalid/plugga_os",
        DEV_AUTH_ENABLED: "false",
        AUTH_SESSION_SECRET: sessionSecret,
      }),
    ).toThrow("Block A only permits a local PostgreSQL host");
  });

  it("requires a session secret of sufficient length", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: localDatabaseUrl,
        DEV_AUTH_ENABLED: "false",
        AUTH_SESSION_SECRET: "too-short",
      }),
    ).toThrow(/AUTH_SESSION_SECRET/);
  });
});
