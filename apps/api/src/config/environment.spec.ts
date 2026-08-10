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
    expect(environment.REDIS_URL).toBe("redis://localhost:6379");
    expect(environment.JOBS_ENABLED).toBe(false);
    expect(environment.JOBS_WORKER_CONCURRENCY).toBe(1);
    expect(environment.EMAIL_FROM_ADDRESS).toBe("no-reply@plugga.local");
  });

  it("requires a Brevo API key when EMAIL_PROVIDER=brevo", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: localDatabaseUrl,
        AUTH_SESSION_SECRET: sessionSecret,
        EMAIL_PROVIDER: "brevo",
      }),
    ).toThrow(/BREVO_API_KEY is required/);
  });

  it("accepts the brevo provider once a key is present", () => {
    const environment = validateEnvironment({
      NODE_ENV: "development",
      DATABASE_URL: localDatabaseUrl,
      AUTH_SESSION_SECRET: sessionSecret,
      EMAIL_PROVIDER: "brevo",
      BREVO_API_KEY: "client-key",
    });

    expect(environment.EMAIL_PROVIDER).toBe("brevo");
    expect(environment.BREVO_API_KEY).toBe("client-key");
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

  it("rejects a non-local Redis host", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: localDatabaseUrl,
        AUTH_SESSION_SECRET: sessionSecret,
        REDIS_URL: "redis://redis.example.invalid:6379",
      }),
    ).toThrow("Block B only permits a local Redis host");
  });

  it("rejects a Redis URL with a wrong protocol", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: localDatabaseUrl,
        AUTH_SESSION_SECRET: sessionSecret,
        REDIS_URL: "http://localhost:6379",
      }),
    ).toThrow("REDIS_URL must use the redis:// or rediss:// protocol");
  });

  it("accepts an explicit local Redis URL and jobs settings", () => {
    const environment = validateEnvironment({
      NODE_ENV: "development",
      DATABASE_URL: localDatabaseUrl,
      AUTH_SESSION_SECRET: sessionSecret,
      REDIS_URL: "redis://127.0.0.1:6380",
      JOBS_ENABLED: "true",
      JOBS_WORKER_CONCURRENCY: "4",
    });

    expect(environment.REDIS_URL).toBe("redis://127.0.0.1:6380");
    expect(environment.JOBS_ENABLED).toBe(true);
    expect(environment.JOBS_WORKER_CONCURRENCY).toBe(4);
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

  it("treats the Bitrix credential as optional and defaults the page size", () => {
    const environment = validateEnvironment({
      NODE_ENV: "development",
      DATABASE_URL: localDatabaseUrl,
      AUTH_SESSION_SECRET: sessionSecret,
    });

    expect(environment.BITRIX_WEBHOOK_URL).toBeUndefined();
    expect(environment.BITRIX_OPM_ENTITY_TYPE_ID).toBeUndefined();
    expect(environment.BITRIX_IMPORT_PAGE_SIZE).toBe(50);
  });

  it("accepts a Bitrix REST webhook over https", () => {
    const environment = validateEnvironment({
      NODE_ENV: "development",
      DATABASE_URL: localDatabaseUrl,
      AUTH_SESSION_SECRET: sessionSecret,
      BITRIX_WEBHOOK_URL: "https://portal.bitrix24.com/rest/1/token/",
      BITRIX_OPM_ENTITY_TYPE_ID: "1032",
    });

    expect(environment.BITRIX_OPM_ENTITY_TYPE_ID).toBe(1032);
  });

  it("rejects a Bitrix webhook sent over plaintext http", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: localDatabaseUrl,
        AUTH_SESSION_SECRET: sessionSecret,
        BITRIX_WEBHOOK_URL: "http://portal.bitrix24.com/rest/1/token/",
      }),
    ).toThrow(/BITRIX_WEBHOOK_URL must use https/);
  });

  it("rejects a URL that is not a Bitrix REST webhook", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: localDatabaseUrl,
        AUTH_SESSION_SECRET: sessionSecret,
        BITRIX_WEBHOOK_URL: "https://portal.bitrix24.com/not-a-webhook/",
      }),
    ).toThrow(/BITRIX_WEBHOOK_URL/);
  });

  it("rejects a page size above the Bitrix per-page cap", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: localDatabaseUrl,
        AUTH_SESSION_SECRET: sessionSecret,
        BITRIX_IMPORT_PAGE_SIZE: "500",
      }),
    ).toThrow(/BITRIX_IMPORT_PAGE_SIZE/);
  });
});
